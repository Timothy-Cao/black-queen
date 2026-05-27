//! Exact endgame solver — exhaustive minimax over the remaining play tree.
//!
//! When few enough cards remain (≤3 tricks = ≤15 cards), the search space is
//! small enough to fully enumerate. We use a recursive depth-first search with
//! alpha-beta-style pruning at the move level, returning the move that
//! maximizes captured points for the caller-team or opposing-team as appropriate.
//!
//! Called from a determinized state — assumes all hands are known. ISMCTS
//! invokes this per sampled determinization in the endgame, then averages the
//! recommendations across samples to handle uncertainty.

use bq_engine::engine::apply_play;
use bq_engine::rules::legal_play_indices;
use bq_engine::types::{Card, GameState, Phase, PlayerId};
use std::collections::HashSet;

/// Returns (best_card_for_self, captured_points_by_value_players).
/// `value_players` is the set whose captured points we maximize.
pub fn solve_endgame(
    state: &GameState,
    self_id: PlayerId,
    value_players: &HashSet<PlayerId>,
) -> (Card, u16) {
    debug_assert_eq!(state.phase, Phase::Playing);
    debug_assert_eq!(state.next_to_act, self_id);
    let trick = state.current_trick.as_ref().expect("trick");
    let legal = legal_play_indices(&state.hands[self_id as usize], Some(trick));
    debug_assert!(!legal.is_empty());

    let mut best_card = state.hands[self_id as usize][legal[0]];
    let mut best_value = u16::MIN;

    for &idx in &legal {
        let card = state.hands[self_id as usize][idx];
        let mut sim = state.clone();
        apply_play(&mut sim, self_id, idx);
        let val = solve_recursive(&sim, self_id, value_players);
        if val > best_value {
            best_value = val;
            best_card = card;
        }
    }
    (best_card, best_value)
}

/// Recursive minimax. From the perspective of `self_id`:
///   - if next_to_act is in value_players → maximize captured by value_players
///   - else → minimize (opponent picks adversarially)
///
/// Returns the captured-points total for `value_players` at game end.
fn solve_recursive(
    state: &GameState,
    self_id: PlayerId,
    value_players: &HashSet<PlayerId>,
) -> u16 {
    if state.phase != Phase::Playing {
        return value_players.iter()
            .map(|&p| state.captured_points[p as usize])
            .sum();
    }
    let p = state.next_to_act;
    let trick = state.current_trick.as_ref().expect("trick");
    let legal = legal_play_indices(&state.hands[p as usize], Some(trick));
    debug_assert!(!legal.is_empty());

    let maximizing = value_players.contains(&p);
    let mut best: u16 = if maximizing { u16::MIN } else { u16::MAX };

    for &idx in &legal {
        let mut sim = state.clone();
        apply_play(&mut sim, p, idx);
        let val = solve_recursive(&sim, self_id, value_players);
        if maximizing {
            if val > best { best = val; }
        } else {
            if val < best { best = val; }
        }
    }
    best
}

/// Heuristic: do we have few enough cards left to enumerate?
/// At ≤2 tricks (10 cards), full minimax is well under 1ms per determinization.
/// Three-trick endgame is feasible but ~10x slower; gated to 2 for now.
pub fn should_solve_endgame(state: &GameState) -> bool {
    // Default OFF: minimax in this solver assumes adversarial-optimal opponents,
    // but Hard-3 (and the real-world opponents we test against) plays a fixed
    // heuristic that's exploitable in ways minimax penalties against. A/B test
    // showed -1.1pp from enabling. Kept in the codebase for a future variant
    // that models heuristic opponents (e.g., ISMCTS-in-endgame with deeper
    // search rather than worst-case minimax). Enable for experiments with
    // BQ_ENDGAME=1.
    #[cfg(not(target_arch = "wasm32"))]
    {
        if std::env::var("BQ_ENDGAME").ok().filter(|s| !s.is_empty()).is_none() {
            return false;
        }
    }
    let total_remaining: usize = state.hands.iter().map(|h| h.len()).sum();
    total_remaining <= 10
}

#[cfg(test)]
mod tests {
    use super::*;
    use bq_engine::deck::build_deck;
    use bq_engine::engine::{apply_bid, apply_declare, apply_pass, apply_play, new_game};
    use bq_engine::rng::from_seed;
    use bq_engine::rules::legal_play_indices;
    use bq_engine::types::Suit;
    use rand::seq::SliceRandom;

    #[test]
    fn endgame_solver_picks_a_legal_card_with_one_trick_left() {
        // should_solve_endgame is gated OFF by default since Session 1.7 A/B.
        // Enable it for this test so the gate-check assertion holds.
        std::env::set_var("BQ_ENDGAME", "1");
        // Drive a game until 5 cards remain across all players (1 trick).
        let mut rng = from_seed(7);
        let mut state = new_game(&mut rng, 0);
        let first = state.next_to_act;
        apply_bid(&mut state, first, 150);
        while state.phase == Phase::Bidding {
            let p = state.next_to_act;
            apply_pass(&mut state, p);
        }
        let caller = state.caller.unwrap() as usize;
        let owned: std::collections::HashMap<(Suit, u8), usize> = {
            let mut m = std::collections::HashMap::new();
            for c in &state.hands[caller] { *m.entry((c.suit, c.rank)).or_insert(0) += 1; }
            m
        };
        let partner_card = *build_deck().iter().find(|c| {
            let total = if c.suit == Suit::S && c.rank == 7 { 1 } else { 2 };
            owned.get(&(c.suit, c.rank)).copied().unwrap_or(0) < total
        }).unwrap();
        apply_declare(&mut state, Suit::S, partner_card);

        // Play until exactly 1 trick remains (5 cards across all players).
        while state.phase == Phase::Playing
            && state.hands.iter().map(|h| h.len()).sum::<usize>() > 5
        {
            let p = state.next_to_act;
            let trick = state.current_trick.as_ref().unwrap();
            let legal = legal_play_indices(&state.hands[p as usize], Some(trick));
            let idx = *legal.choose(&mut rng).unwrap();
            apply_play(&mut state, p, idx);
        }
        let total_remaining: usize = state.hands.iter().map(|h| h.len()).sum();
        assert!(total_remaining <= 5);
        assert_eq!(state.phase, Phase::Playing);
        assert!(should_solve_endgame(&state));

        let self_id = state.next_to_act;
        let mut value_players = HashSet::new();
        value_players.insert(self_id);
        let (card, _val) = solve_endgame(&state, self_id, &value_players);
        let hand = &state.hands[self_id as usize];
        assert!(hand.contains(&card), "solver picked card not in hand");
    }
}
