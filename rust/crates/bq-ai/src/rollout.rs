//! Rollout policies for ISMCTS leaf evaluation.
//!
//! Three rollouts available, in increasing strength:
//!  - `rollout_random` — uniform-random legal play. Baseline only.
//!  - `rollout_greedy` — cheap heuristic. Lead low, win cheaply when points up.
//!  - `rollout_tactical` — team-aware: smear to allies, dump on enemies,
//!     defensive trump, Q♠ care. Production default for ISMCTS.
//!
//! The tactical rollout exploits the fact that AFTER determinization the
//! simulator has perfect information — every player's hand is known, so the
//! caller's team is fully identifiable from who holds the partner card.

use bq_engine::engine::apply_play;
use bq_engine::rng::GameRng;
use bq_engine::rules::{legal_play_indices, trick_winner};
use bq_engine::types::{Card, GameState, Phase, PlayerId, Suit, Trick, TrickPlay};
use rand::seq::SliceRandom;
use std::collections::HashSet;

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
pub fn rollout_greedy(state: &mut GameState, _rng: &mut GameRng) {
    while state.phase == Phase::Playing {
        let p = state.next_to_act;
        let trump = state.trump;
        let hand = &state.hands[p as usize];
        let trick = state.current_trick.as_ref().expect("trick");
        let legal_idx = legal_play_indices(hand, Some(trick));
        let chosen = pick_greedy(hand, &legal_idx, trick, trump);
        apply_play(state, p, chosen);
    }
}

/// Tactical rollout: team-aware, smears to allies, dumps on enemies, defends
/// against high-point opponent tricks. Uses full determinization knowledge —
/// the simulator can see all hands, so team membership is exact.
pub fn rollout_tactical(state: &mut GameState, _rng: &mut GameRng) {
    // Compute team once per rollout — partner card is fixed across the rollout.
    let team = compute_caller_team(state);
    while state.phase == Phase::Playing {
        let p = state.next_to_act;
        let trump = state.trump;
        let trick = state.current_trick.as_ref().expect("trick");
        let hand = &state.hands[p as usize];
        let legal_idx = legal_play_indices(hand, Some(trick));
        let chosen = pick_tactical(hand, &legal_idx, trick, trump, p, &team);
        apply_play(state, p, chosen);
    }
}

fn compute_caller_team(state: &GameState) -> HashSet<PlayerId> {
    let mut team = HashSet::new();
    let Some(caller) = state.caller else { return team };
    let Some(pc) = state.partner_card else { return team };
    team.insert(caller);
    // Anyone holding a copy of the partner card (in remaining hand OR already played).
    for p in 0..5u8 {
        if state.hands[p as usize].iter().any(|c| c.suit == pc.suit && c.rank == pc.rank) {
            team.insert(p);
        }
    }
    // Also: anyone who already PLAYED the partner card is on the team.
    for trick in &state.tricks {
        for tp in &trick.plays {
            if tp.card.suit == pc.suit && tp.card.rank == pc.rank {
                team.insert(tp.player);
            }
        }
    }
    if let Some(cur) = &state.current_trick {
        for tp in &cur.plays {
            if tp.card.suit == pc.suit && tp.card.rank == pc.rank {
                team.insert(tp.player);
            }
        }
    }
    team
}

pub fn pick_greedy(
    hand: &[Card],
    legal_idx: &[usize],
    trick: &Trick,
    trump: Option<Suit>,
) -> usize {
    debug_assert!(!legal_idx.is_empty());
    let legal_cards: Vec<(usize, Card)> = legal_idx.iter().map(|&i| (i, hand[i])).collect();

    if trick.plays.is_empty() {
        return lead_low_non_trump(&legal_cards, trump);
    }

    let trick_pts: u16 = trick.plays.iter().map(|p| p.card.points()).sum();
    let beating = beating_cards(&legal_cards, trick, trump);

    if !beating.is_empty() && trick_pts >= 10 {
        return beating.iter().min_by_key(|(_, c)| c.rank).unwrap().0;
    }
    dump_lowest(&legal_cards, trump)
}

fn pick_tactical(
    hand: &[Card],
    legal_idx: &[usize],
    trick: &Trick,
    trump: Option<Suit>,
    player: PlayerId,
    team: &HashSet<PlayerId>,
) -> usize {
    debug_assert!(!legal_idx.is_empty());
    let legal_cards: Vec<(usize, Card)> = legal_idx.iter().map(|&i| (i, hand[i])).collect();

    if trick.plays.is_empty() {
        return lead_low_non_trump(&legal_cards, trump);
    }

    let on_caller_team = team.contains(&player);
    let trick_pts: u16 = trick.plays.iter().map(|p| p.card.points()).sum();
    let cur_winner = trick_winner(trick, trump);
    let winner_is_ally = if on_caller_team {
        team.contains(&cur_winner)
    } else {
        !team.contains(&cur_winner)
    };

    // CASE 1: ally is currently winning → smear high-point card (feed the trick).
    if winner_is_ally {
        // Prefer a non-trump point card so we don't waste trump on a teammate's trick.
        let non_trump_points: Vec<&(usize, Card)> = legal_cards.iter()
            .filter(|(_, c)| c.points() > 0 && trump.map_or(true, |t| c.suit != t))
            .collect();
        if !non_trump_points.is_empty() {
            // Highest-point card we can spare. Q♠ (30 pts) is special — only smear if
            // we're certain ally wins (which we know via team).
            let pick = non_trump_points.iter()
                .max_by_key(|(_, c)| (c.points(), c.rank))
                .unwrap();
            return pick.0;
        }
        // No non-trump points — dump lowest non-trump.
        return dump_lowest(&legal_cards, trump);
    }

    // CASE 2: opponent is winning. Can we beat them?
    let beating = beating_cards(&legal_cards, trick, trump);
    if !beating.is_empty() {
        // Worth taking if the trick has any points OR we'd otherwise lose Q♠.
        let q_spades_on_table = trick.plays.iter().any(|p| p.card.suit == Suit::S && p.card.rank == 12);
        // Heuristic value of taking: trick_pts + Q♠ bonus + small intrinsic capture value.
        let take_value = trick_pts + if q_spades_on_table { 30 } else { 0 };
        if take_value >= 10 {
            // Prefer cheapest non-trump winner; fall back to cheapest winner.
            let non_trump_winners: Vec<&&(usize, Card)> = beating.iter()
                .filter(|(_, c)| trump.map_or(true, |t| c.suit != t))
                .collect();
            let pool: Vec<_> = if !non_trump_winners.is_empty() {
                non_trump_winners.iter().map(|x| **x).collect()
            } else {
                beating.clone()
            };
            return pool.iter().min_by_key(|(_, c)| c.rank).unwrap().0;
        }
    }

    // CASE 3: can't / won't win. Don't dump points onto an enemy-won trick.
    // Drop the lowest non-point non-trump if possible; preserve Q♠ at all costs.
    let safe: Vec<&(usize, Card)> = legal_cards.iter()
        .filter(|(_, c)| c.points() == 0 && !(c.suit == Suit::S && c.rank == 12))
        .collect();
    if !safe.is_empty() {
        let non_trump: Vec<&&(usize, Card)> = safe.iter()
            .filter(|(_, c)| trump.map_or(true, |t| c.suit != t))
            .collect();
        let pool: Vec<_> = if !non_trump.is_empty() {
            non_trump.iter().map(|x| **x).collect()
        } else {
            safe.clone()
        };
        return pool.iter().min_by_key(|(_, c)| c.rank).unwrap().0;
    }
    // All legal cards are point cards — give up cheapest point card.
    legal_cards.iter().min_by_key(|(_, c)| (c.points(), c.rank)).unwrap().0
}

fn lead_low_non_trump(legal_cards: &[(usize, Card)], trump: Option<Suit>) -> usize {
    if let Some(t) = trump {
        let non_trump: Vec<&(usize, Card)> = legal_cards.iter()
            .filter(|(_, c)| c.suit != t)
            .collect();
        if !non_trump.is_empty() {
            return non_trump.iter().min_by_key(|(_, c)| c.rank).unwrap().0;
        }
    }
    legal_cards.iter().min_by_key(|(_, c)| c.rank).unwrap().0
}

fn dump_lowest(legal_cards: &[(usize, Card)], trump: Option<Suit>) -> usize {
    let non_trump: Vec<&(usize, Card)> = legal_cards.iter()
        .filter(|(_, c)| trump.map_or(true, |t| c.suit != t))
        .collect();
    let pool: Vec<_> = if non_trump.is_empty() {
        legal_cards.iter().collect::<Vec<_>>()
    } else {
        non_trump
    };
    pool.iter().min_by_key(|(_, c)| c.rank).unwrap().0
}

fn beating_cards<'a>(
    legal_cards: &'a [(usize, Card)],
    trick: &Trick,
    trump: Option<Suit>,
) -> Vec<&'a (usize, Card)> {
    legal_cards.iter().filter(|(_, c)| {
        let mut hypo = trick.clone();
        hypo.plays.push(TrickPlay { player: 99, card: *c });
        trick_winner(&hypo, trump) == 99
    }).collect()
}
