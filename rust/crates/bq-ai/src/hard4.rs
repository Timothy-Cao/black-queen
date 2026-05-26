//! Hard-4 public entry points: bid, declare, play.
//!
//! v0 implementation:
//! - `hard4_bid`: heuristic (greedy +5 cap 200, strong hands only).
//! - `hard4_declare`: heuristic (longest suit as trump, ace/Q♠ as partner card).
//! - `hard4_play`: full ISMCTS with hard-constraint belief built from observed plays.
//!
//! Bid and declare upgrade to ISMCTS evaluation in Session 2.

use crate::belief::BeliefState;
use crate::handeval::{evaluate_hand, estimate_bid_capacity};
use crate::ismcts::{ismcts_play, SearchParams};
use bq_engine::deck::build_deck;
use bq_engine::rng::GameRng;
use bq_engine::types::{Card, GameState, PlayerId, Suit};
use std::time::Duration;

/// Returns the bid amount to make, or None to pass.
///
/// Bid up while the next legal bid is within our hand's capacity estimate
/// minus a safety margin. Capacity = evaluate_hand(self).estimate_capture.
/// Safety margin reflects partner contribution uncertainty: we expect ~30-60
/// points of help from whoever holds the partner card, but it's noisy.
pub fn hard4_bid(state: &GameState, self_id: PlayerId) -> Option<u16> {
    let hand = &state.hands[self_id as usize];
    let capacity = estimate_bid_capacity(hand);
    let current = state.winning_bid.unwrap_or(0);
    let required: u16 = if current < 150 { 150 } else { current + 5 };

    // Target = floor(capacity / 5) * 5, capped at 240 unless capacity > 280.
    let mut target = (capacity / 5) * 5;
    if target > 240 && capacity < 280 { target = 240; }
    if target > 300 { target = 300; }

    if required > target { return None; }
    Some(required)
}

/// Decide trump suit and partner card.
///
/// Trump: the suit our hand evaluator picks as strongest (not just longest).
/// Partner card: highest-rank rank+suit we own ZERO copies of, walking ranks
/// high → low. This mirrors the Hard-3/Normal partner-call rule: by calling a
/// high card we don't hold, we maximize the chance our partner has the trump-
/// suit equivalent or a top side card.
pub fn hard4_declare(state: &GameState, self_id: PlayerId) -> (Suit, Card) {
    let hand = &state.hands[self_id as usize];
    let eval = evaluate_hand(hand);
    let trump = eval.best_trump;

    let mut owned = std::collections::HashMap::<(Suit, u8), usize>::new();
    for c in hand { *owned.entry((c.suit, c.rank)).or_insert(0) += 1; }
    let count_of = |s: Suit, r: u8| owned.get(&(s, r)).copied().unwrap_or(0);

    // Walk ranks high → low; pick the first (rank, suit) we hold ZERO of.
    // Skip 7-of-non-spades (only 7♠ exists in the deck).
    let ranks: [u8; 9] = [14, 13, 12, 11, 10, 9, 8, 7, 5];
    for rank in ranks {
        for &suit in &Suit::ALL {
            if rank == 7 && suit != Suit::S { continue; }
            if count_of(suit, rank) == 0 {
                return (trump, Card { suit, rank });
            }
        }
    }
    // Fallback: should be unreachable in a 13-card hand from a 65-card deck.
    let all = build_deck();
    let pc = *all.iter().find(|c| {
        let total = if c.suit == Suit::S && c.rank == 7 { 1 } else { 2 };
        count_of(c.suit, c.rank) < total
    }).expect("at least one available partner card");
    (trump, pc)
}

/// Decide a card to play via ISMCTS. Belief is reconstructed from observed
/// history each call (v0; future versions can thread an incrementally-updated
/// belief through the AI driver to avoid recomputation).
pub fn hard4_play(
    state: &GameState,
    self_id: PlayerId,
    time_ms: u64,
    rng: &mut GameRng,
) -> Card {
    let mine = state.hands[self_id as usize].clone();
    let all = build_deck();
    let mut belief = BeliefState::new(self_id, &mine, &all);

    // Replay declare event.
    if let (Some(caller), Some(pc)) = (state.caller, state.partner_card) {
        belief.on_declare(caller, pc);
    }
    // Replay all completed tricks.
    for trick in &state.tricks {
        let led_suit = trick.plays[0].card.suit;
        for tp in &trick.plays {
            if tp.player != self_id && tp.card.suit != led_suit {
                belief.on_non_follow(tp.player, led_suit);
            }
            belief.on_play(tp.player, tp.card);
        }
    }
    // Replay current trick.
    if let Some(cur) = &state.current_trick {
        if let Some(led) = cur.plays.first().map(|tp| tp.card.suit) {
            for tp in &cur.plays {
                if tp.player != self_id && tp.card.suit != led {
                    belief.on_non_follow(tp.player, led);
                }
                belief.on_play(tp.player, tp.card);
            }
        }
    }

    // On wasm32 we cannot use a wall-clock deadline (no monotonic clock).
    // Approximate by capping iterations proportional to time_ms: ~3 iterations
    // per ms on a typical laptop in release mode. Native paths use real time.
    #[cfg(target_arch = "wasm32")]
    let max_iters = (time_ms.saturating_mul(3)).max(64);
    #[cfg(not(target_arch = "wasm32"))]
    let max_iters = 100_000u64;

    // Value reflects the captured points of OUR TEAM, not just our own pile.
    // For the caller and known partners, we can identify teammates exactly from
    // the partner card. For an opponent, we maximize OUR team (= everyone NOT on
    // caller's team that we can confirm).
    let value_players = compute_value_players(state, self_id);

    let params = SearchParams {
        time_budget: Duration::from_millis(time_ms),
        min_iterations: 64,
        max_iterations: max_iters,
        self_id,
        value_players,
        ..Default::default()
    };
    ismcts_play(state, &belief, rng, &params)
}

/// Determine whose captured-points we sum when scoring a rollout's outcome.
/// For now we use: caller team if self is caller or holds partner card; else
/// opposing team (everyone NOT on caller team that we can verify).
/// Anonymous opponents fall back to a self-only value.
fn compute_value_players(state: &GameState, self_id: PlayerId) -> Vec<PlayerId> {
    let Some(caller) = state.caller else { return vec![self_id] };
    let Some(pc) = state.partner_card else { return vec![self_id] };
    let my_hand = &state.hands[self_id as usize];
    let i_hold_pc = my_hand.iter().any(|c| c.suit == pc.suit && c.rank == pc.rank);
    let i_am_caller_team = self_id == caller || i_hold_pc;

    // Also recognize partners who have already played the partner card.
    let mut revealed_partners: std::collections::HashSet<PlayerId> = std::collections::HashSet::new();
    revealed_partners.insert(caller);
    if i_hold_pc { revealed_partners.insert(self_id); }
    for trick in &state.tricks {
        for tp in &trick.plays {
            if tp.card.suit == pc.suit && tp.card.rank == pc.rank {
                revealed_partners.insert(tp.player);
            }
        }
    }
    if let Some(cur) = &state.current_trick {
        for tp in &cur.plays {
            if tp.card.suit == pc.suit && tp.card.rank == pc.rank {
                revealed_partners.insert(tp.player);
            }
        }
    }

    if i_am_caller_team {
        revealed_partners.insert(self_id);
        revealed_partners.into_iter().collect()
    } else {
        // I'm on the opposing team. Sum captured points for everyone not in
        // revealed_partners. (Unrevealed partners may sneak into the sum, but
        // until they reveal we cannot distinguish them.)
        (0..5u8).filter(|p| !revealed_partners.contains(p)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bq_engine::engine::{apply_bid, apply_declare, apply_pass, apply_play, new_game};
    use bq_engine::rng::from_seed;
    use bq_engine::rules::legal_play_indices;
    use bq_engine::types::Phase;

    #[test]
    fn hard4_play_legal_for_full_game() {
        let mut rng = from_seed(42);
        let mut state = new_game(&mut rng, 0);
        let first = state.next_to_act;
        apply_bid(&mut state, first, 150);
        while state.phase == Phase::Bidding {
            let p = state.next_to_act;
            apply_pass(&mut state, p);
        }
        let caller = state.caller.unwrap();
        let (trump, pc) = hard4_declare(&state, caller);
        apply_declare(&mut state, trump, pc);

        let mut play_rng = from_seed(99);
        while state.phase == Phase::Playing {
            let p = state.next_to_act;
            let card = hard4_play(&state, p, 5, &mut play_rng); // tiny budget for speed
            // Validate legality and execute.
            let trick = state.current_trick.as_ref().unwrap();
            let legal = legal_play_indices(&state.hands[p as usize], Some(trick));
            let legal_cards: Vec<Card> = legal.iter().map(|&i| state.hands[p as usize][i]).collect();
            assert!(legal_cards.contains(&card), "hard4_play returned illegal card {:?}", card);
            let idx = state.hands[p as usize].iter().position(|c| *c == card).unwrap();
            apply_play(&mut state, p, idx);
        }
        assert_eq!(state.phase, Phase::Done);
        assert_eq!(state.captured_points.iter().sum::<u16>(), 300);
    }
}
