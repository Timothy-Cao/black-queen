//! Rollout policies for ISMCTS leaf evaluation.
//!
//! Two rollouts available:
//!  - `rollout_random` — uniform-random legal play. Baseline. Used in tests.
//!  - `rollout_greedy` — cheap heuristic that's strictly stronger than random:
//!     * Lead with low non-trump from longest non-trump suit (hold trump for later).
//!     * If trick has been led and we can win it cheaply with a point card,
//!       win it. Otherwise dump lowest legal.
//!
//! `rollout_greedy` is the production default — random rollouts dilute the
//! ISMCTS signal because most random games end in roughly equal point splits.

use bq_engine::engine::apply_play;
use bq_engine::rng::GameRng;
use bq_engine::rules::{legal_play_indices, trick_winner};
use bq_engine::types::{Card, GameState, Phase, Suit};
use rand::seq::SliceRandom;

/// Plays a determinized state to completion using uniform-random legal moves.
pub fn rollout_random(state: &mut GameState, rng: &mut GameRng) {
    while state.phase == Phase::Playing {
        let p = state.next_to_act;
        let legal = {
            let trick = state.current_trick.as_ref().expect("trick exists during Playing phase");
            legal_play_indices(&state.hands[p as usize], Some(trick))
        };
        let idx = *legal.choose(rng).expect("at least one legal play");
        apply_play(state, p, idx);
    }
}

/// Plays to completion using a cheap heuristic stronger than random.
/// All players use the same heuristic — symmetry preserved so the rollout is
/// an unbiased estimate of "what happens if everyone plays naturally."
pub fn rollout_greedy(state: &mut GameState, _rng: &mut GameRng) {
    while state.phase == Phase::Playing {
        let p = state.next_to_act;
        let trump = state.trump;
        let hand = &state.hands[p as usize];
        let trick = state.current_trick.as_ref().expect("trick");
        let legal_idx = legal_play_indices(hand, Some(trick));
        let chosen_idx = pick_greedy(hand, &legal_idx, trick, trump);
        apply_play(state, p, chosen_idx);
    }
}

fn pick_greedy(
    hand: &[Card],
    legal_idx: &[usize],
    trick: &bq_engine::types::Trick,
    trump: Option<Suit>,
) -> usize {
    debug_assert!(!legal_idx.is_empty());
    let legal_cards: Vec<(usize, Card)> = legal_idx.iter().map(|&i| (i, hand[i])).collect();

    // Leading: play low non-trump from the longest non-trump suit (save trump).
    if trick.plays.is_empty() {
        if let Some(t) = trump {
            // Pick the longest non-trump suit we have.
            let mut suit_counts: [(Suit, usize); 4] = [
                (Suit::S, 0), (Suit::H, 0), (Suit::D, 0), (Suit::C, 0),
            ];
            for &(_, c) in &legal_cards {
                if c.suit != t {
                    let idx = match c.suit {
                        Suit::S => 0, Suit::H => 1, Suit::D => 2, Suit::C => 3,
                    };
                    suit_counts[idx].1 += 1;
                }
            }
            if let Some(&(target_suit, len)) = suit_counts.iter()
                .max_by_key(|s| s.1)
            {
                if len > 0 {
                    // Lowest of that suit.
                    let pick = legal_cards.iter()
                        .filter(|(_, c)| c.suit == target_suit)
                        .min_by_key(|(_, c)| c.rank)
                        .unwrap();
                    return pick.0;
                }
            }
        }
        // No trump set, or only trumps remaining: lead lowest legal.
        return legal_cards.iter().min_by_key(|(_, c)| c.rank).unwrap().0;
    }

    // Following: if we can win the trick cheaply, take it (especially if points are on the table).
    let cur_winner = trick_winner(trick, trump);
    let cur_winner_card = trick.plays.iter().find(|p| p.player == cur_winner).map(|p| p.card);
    let trick_pts: u16 = trick.plays.iter().map(|p| p.card.points()).sum();

    // Can any legal card beat the current winner?
    let beating: Vec<&(usize, Card)> = legal_cards.iter().filter(|(_, c)| {
        let mut hypo = trick.clone();
        hypo.plays.push(bq_engine::types::TrickPlay { player: 99, card: *c });
        trick_winner(&hypo, trump) == 99
    }).collect();

    if !beating.is_empty() && trick_pts >= 10 {
        // Win it cheaply: lowest card that wins.
        let pick = beating.iter().min_by_key(|(_, c)| c.rank).unwrap();
        return pick.0;
    }

    // Otherwise dump: lowest non-trump if possible, else lowest legal. But if
    // current winner is already winning and there are points, don't waste an Ace.
    let non_trump: Vec<&(usize, Card)> = legal_cards.iter()
        .filter(|(_, c)| trump.map_or(true, |t| c.suit != t))
        .collect();
    let pool = if non_trump.is_empty() { legal_cards.iter().collect::<Vec<_>>() } else { non_trump };
    let pick = pool.iter().min_by_key(|(_, c)| c.rank).unwrap();
    // Suppress unused warning when no winner found.
    let _ = cur_winner_card;
    pick.0
}

