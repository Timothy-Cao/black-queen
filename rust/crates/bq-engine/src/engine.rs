//! Rust port of src/game/engine.ts. Simplified: this is the AI's internal
//! scratchpad, not the user-facing engine. No log entries, no UI pause flags,
//! no partner-reveal bookkeeping (the belief layer in bq-ai handles inference).
//!
//! Tricks here are auto-collected immediately on the 5th play; the TS engine
//! holds a UI pause via `pendingTrickComplete`, but for search-time simulation
//! the pause is irrelevant.

use crate::deck::{build_deck, deal_hands, shuffle_seeded};
use crate::rng::GameRng;
use crate::rules::{legal_play_indices, next_player, trick_points, trick_winner};
use crate::types::{BidEntry, Card, GameState, Phase, PlayerId, Suit, Trick, TrickPlay};

pub fn new_game(rng: &mut GameRng, first_bidder: PlayerId) -> GameState {
    let mut deck = build_deck();
    shuffle_seeded(&mut deck, rng);
    let hands = deal_hands(deck);
    GameState {
        phase: Phase::Bidding,
        hands,
        bids: Vec::new(),
        caller: None,
        winning_bid: None,
        trump: None,
        partner_card: None,
        tricks: Vec::new(),
        current_trick: None,
        next_to_act: first_bidder,
        captured_points: vec![0; 5],
        passed: vec![false; 5],
    }
}

fn next_eligible_bidder(passed: &[bool], from: PlayerId) -> Option<PlayerId> {
    for offset in 1..=5 {
        let p = ((from as usize + offset) % 5) as PlayerId;
        if !passed[p as usize] { return Some(p); }
    }
    None
}

pub fn highest_bid(state: &GameState) -> u16 {
    state.bids.iter()
        .filter_map(|b| b.amount)
        .max()
        .unwrap_or(0)
}

/// Apply a bid action (non-pass). Caller and winning_bid update; turn advances.
pub fn apply_bid(state: &mut GameState, player: PlayerId, amount: u16) {
    debug_assert_eq!(state.phase, Phase::Bidding);
    debug_assert_eq!(state.next_to_act, player);
    debug_assert!(!state.passed[player as usize]);
    debug_assert!((150..=300).contains(&amount) && amount % 5 == 0);
    let hi = highest_bid(state);
    debug_assert!(amount > hi || (hi == 0 && amount >= 150));
    state.bids.push(BidEntry { player, amount: Some(amount) });
    state.winning_bid = Some(amount);
    state.caller = Some(player);
    advance_after_bid_action(state);
}

pub fn apply_pass(state: &mut GameState, player: PlayerId) {
    debug_assert_eq!(state.phase, Phase::Bidding);
    debug_assert_eq!(state.next_to_act, player);
    state.bids.push(BidEntry { player, amount: None });
    state.passed[player as usize] = true;
    advance_after_bid_action(state);
}

fn advance_after_bid_action(state: &mut GameState) {
    let active: Vec<PlayerId> = (0..5u8).filter(|p| !state.passed[*p as usize]).collect();
    let hi = highest_bid(state);
    // Standard rule: bidding closes when only one active bidder remains AND there is a bid.
    if active.len() == 1 && hi > 0 {
        state.phase = Phase::Declaring;
        state.next_to_act = state.caller.expect("caller exists when bid placed");
        return;
    }
    // Degenerate fallback for AI sim: if everyone passed with no bid, force first
    // (active or 0) to bid min and proceed — saves us from a redeal loop.
    if active.is_empty() && hi == 0 {
        state.passed = vec![false; 5];
        state.caller = Some(0);
        state.winning_bid = Some(150);
        state.bids.push(BidEntry { player: 0, amount: Some(150) });
        state.phase = Phase::Declaring;
        state.next_to_act = 0;
        return;
    }
    state.next_to_act = next_eligible_bidder(&state.passed, state.next_to_act)
        .expect("there must be an eligible bidder");
}

/// Apply declare: trump + partner card chosen.
/// Caller cannot own ALL copies of the partner card (only 1 copy of 7♠ exists,
/// otherwise 2 copies per suit/rank).
pub fn apply_declare(state: &mut GameState, trump: Suit, partner_card: Card) {
    debug_assert_eq!(state.phase, Phase::Declaring);
    let caller = state.caller.expect("caller exists");
    let total_copies = if partner_card.suit == Suit::S && partner_card.rank == 7 { 1 } else { 2 };
    let owned = state.hands[caller as usize].iter()
        .filter(|c| c.suit == partner_card.suit && c.rank == partner_card.rank)
        .count();
    debug_assert!(owned < total_copies, "caller cannot own all copies of partner card");

    state.trump = Some(trump);
    state.partner_card = Some(partner_card);
    state.phase = Phase::Playing;
    state.current_trick = Some(Trick {
        leader: caller, plays: Vec::new(), winner: None, points: None,
    });
    state.next_to_act = caller;
}

/// Apply a play by `player` of card at `card_index` in their hand.
/// When the trick reaches 5 plays, auto-collects and starts the next.
pub fn apply_play(state: &mut GameState, player: PlayerId, card_index: usize) {
    debug_assert_eq!(state.phase, Phase::Playing);
    debug_assert_eq!(state.next_to_act, player);
    let legal = {
        let trick = state.current_trick.as_ref().expect("current trick");
        legal_play_indices(&state.hands[player as usize], Some(trick))
    };
    debug_assert!(legal.contains(&card_index), "illegal play attempted");
    let card = state.hands[player as usize].remove(card_index);
    state.current_trick.as_mut().expect("trick").plays.push(TrickPlay { player, card });

    let plays_now = state.current_trick.as_ref().unwrap().plays.len();
    if plays_now < 5 {
        state.next_to_act = next_player(player);
    } else {
        collect_trick(state);
    }
}

/// Resolves the current trick: assigns winner, awards points, archives,
/// starts next trick or moves to Done.
pub fn collect_trick(state: &mut GameState) {
    let trump = state.trump;
    let mut trick = state.current_trick.take().expect("trick to collect");
    let winner = trick_winner(&trick, trump);
    let pts = trick_points(&trick);
    state.captured_points[winner as usize] += pts;
    trick.winner = Some(winner);
    trick.points = Some(pts);
    state.tricks.push(trick);
    if state.hands.iter().all(|h| h.is_empty()) {
        state.phase = Phase::Done;
        state.current_trick = None;
    } else {
        state.current_trick = Some(Trick {
            leader: winner, plays: Vec::new(), winner: None, points: None,
        });
        state.next_to_act = winner;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rng::from_seed;
    use rand::seq::SliceRandom;

    #[test]
    fn new_game_is_in_bidding_with_65_cards_dealt() {
        let s = new_game(&mut from_seed(7), 0);
        assert_eq!(s.phase, Phase::Bidding);
        assert_eq!(s.hands.iter().map(|h| h.len()).sum::<usize>(), 65);
        for h in &s.hands { assert_eq!(h.len(), 13); }
    }

    #[test]
    fn bidding_closes_when_four_pass_after_one_bid() {
        let mut rng = from_seed(1);
        let mut s = new_game(&mut rng, 0);
        apply_bid(&mut s, 0, 150);
        for _ in 0..4 {
            let p = s.next_to_act;
            apply_pass(&mut s, p);
        }
        assert_eq!(s.phase, Phase::Declaring);
        assert_eq!(s.caller, Some(0));
        assert_eq!(s.winning_bid, Some(150));
    }

    #[test]
    fn full_random_game_scores_to_300_and_completes_13_tricks() {
        let mut rng = from_seed(123);
        let mut state = new_game(&mut rng, 0);
        apply_bid(&mut state, 0, 150);
        while state.phase == Phase::Bidding {
            let p = state.next_to_act;
            apply_pass(&mut state, p);
        }
        // Declare spades + any card the caller doesn't hold both copies of.
        let caller = state.caller.unwrap() as usize;
        let owned: std::collections::HashMap<(Suit, u8), usize> = {
            let mut m = std::collections::HashMap::new();
            for c in &state.hands[caller] {
                *m.entry((c.suit, c.rank)).or_insert(0) += 1;
            }
            m
        };
        let partner_card = *build_deck().iter().find(|c| {
            let total = if c.suit == Suit::S && c.rank == 7 { 1 } else { 2 };
            owned.get(&(c.suit, c.rank)).copied().unwrap_or(0) < total
        }).unwrap();
        apply_declare(&mut state, Suit::S, partner_card);

        while state.phase == Phase::Playing {
            let p = state.next_to_act;
            let trick = state.current_trick.as_ref().unwrap();
            let legal = legal_play_indices(&state.hands[p as usize], Some(trick));
            let idx = *legal.choose(&mut rng).unwrap();
            apply_play(&mut state, p, idx);
        }
        assert_eq!(state.phase, Phase::Done);
        let total: u16 = state.captured_points.iter().sum();
        assert_eq!(total, 300);
        assert_eq!(state.tricks.len(), 13);
    }

    #[test]
    fn many_random_games_all_complete_with_valid_invariants() {
        for seed in 0..50u64 {
            let mut rng = from_seed(seed);
            let mut state = new_game(&mut rng, (seed % 5) as u8);
            let first = state.next_to_act;
            apply_bid(&mut state, first, 150);
            while state.phase == Phase::Bidding {
                let p = state.next_to_act;
                apply_pass(&mut state, p);
            }
            let caller = state.caller.unwrap() as usize;
            let owned: std::collections::HashMap<(Suit, u8), usize> = {
                let mut m = std::collections::HashMap::new();
                for c in &state.hands[caller] {
                    *m.entry((c.suit, c.rank)).or_insert(0) += 1;
                }
                m
            };
            let partner_card = *build_deck().iter().find(|c| {
                let total = if c.suit == Suit::S && c.rank == 7 { 1 } else { 2 };
                owned.get(&(c.suit, c.rank)).copied().unwrap_or(0) < total
            }).unwrap();
            apply_declare(&mut state, Suit::S, partner_card);

            while state.phase == Phase::Playing {
                let p = state.next_to_act;
                let trick = state.current_trick.as_ref().unwrap();
                let legal = legal_play_indices(&state.hands[p as usize], Some(trick));
                let idx = *legal.choose(&mut rng).unwrap();
                apply_play(&mut state, p, idx);
            }
            assert_eq!(state.phase, Phase::Done, "seed {} did not finish", seed);
            assert_eq!(state.captured_points.iter().sum::<u16>(), 300, "seed {} points sum", seed);
            assert_eq!(state.tricks.len(), 13, "seed {} trick count", seed);
        }
    }
}
