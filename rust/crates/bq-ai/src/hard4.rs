//! Hard-4 public entry points: bid, declare, play.
//!
//! v0 implementation:
//! - `hard4_bid`: heuristic (greedy +5 cap 200, strong hands only).
//! - `hard4_declare`: heuristic (longest suit as trump, ace/Q♠ as partner card).
//! - `hard4_play`: full ISMCTS with hard-constraint belief built from observed plays.
//!
//! Bid and declare upgrade to ISMCTS evaluation in Session 2.

use crate::belief::BeliefState;
use crate::ismcts::{ismcts_play, SearchParams};
use bq_engine::deck::build_deck;
use bq_engine::rng::GameRng;
use bq_engine::types::{Card, GameState, PlayerId, Suit};
use std::time::Duration;

/// Returns the bid amount to make, or None to pass.
/// Greedy heuristic: bid up while hand has ≥ 2 aces, or holds Q♠, or has a 6+ suit.
/// Cap at 200.
pub fn hard4_bid(state: &GameState, self_id: PlayerId) -> Option<u16> {
    let hand = &state.hands[self_id as usize];
    let aces = hand.iter().filter(|c| c.rank == 14).count();
    let has_q_spades = hand.iter().any(|c| c.suit == Suit::S && c.rank == 12);
    let max_suit_len = Suit::ALL.iter()
        .map(|&s| hand.iter().filter(|c| c.suit == s).count())
        .max().unwrap_or(0);

    let strong = aces >= 2 || has_q_spades || max_suit_len >= 6;
    if !strong { return None; }

    let current = state.winning_bid.unwrap_or(145);
    let next = if current < 150 { 150 } else { current + 5 };
    if next > 200 { return None; }
    Some(next)
}

/// Decide trump suit and partner card.
/// v0: trump = longest suit; partner_card = highest-value card we don't already
/// hold both copies of (prefer A, then Q♠, then K, then any).
pub fn hard4_declare(state: &GameState, self_id: PlayerId) -> (Suit, Card) {
    let hand = &state.hands[self_id as usize];
    let trump = Suit::ALL.iter().copied()
        .max_by_key(|&s| hand.iter().filter(|c| c.suit == s).count())
        .unwrap_or(Suit::S);

    // Count copies of each (suit, rank) in our hand.
    let mut owned = std::collections::HashMap::<(Suit, u8), usize>::new();
    for c in hand { *owned.entry((c.suit, c.rank)).or_insert(0) += 1; }

    let total_copies = |c: &Card| -> usize {
        if c.suit == Suit::S && c.rank == 7 { 1 } else { 2 }
    };
    let available = |c: &Card| -> bool {
        owned.get(&(c.suit, c.rank)).copied().unwrap_or(0) < total_copies(c)
    };

    let all = build_deck();
    // Prefer: Aces first, then Q♠, then Kings, then any available.
    let preferred = all.iter().find(|c| c.rank == 14 && available(c))
        .or_else(|| all.iter().find(|c| c.suit == Suit::S && c.rank == 12 && available(c)))
        .or_else(|| all.iter().find(|c| c.rank == 13 && available(c)))
        .or_else(|| all.iter().find(|c| available(c)));
    let pc = *preferred.expect("at least one available partner card must exist");
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

    let params = SearchParams {
        time_budget: Duration::from_millis(time_ms),
        min_iterations: 64,
        max_iterations: 100_000,
        self_id,
        value_players: vec![self_id],
        ..Default::default()
    };
    ismcts_play(state, &belief, rng, &params)
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
