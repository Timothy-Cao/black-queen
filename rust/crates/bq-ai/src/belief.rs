//! Hard-constraint belief tracker for Hard-4.
//!
//! For each unseen card (not in self's hand, not yet played), tracks the *count*
//! of remaining copies (the deck has 2 copies of most cards). For each opponent,
//! tracks which (suit, rank) values they provably cannot hold.
//!
//! Hard constraints alone are enough for a meaningful first cut at ISMCTS:
//! suit voids and played-card observations dramatically narrow the determinization
//! space, even before soft signals (bid strength, smear/withhold) are added.

use bq_engine::types::{Card, PlayerId, Suit};
use bq_engine::rng::GameRng;
use rand::Rng;
use rand::seq::SliceRandom;
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug)]
pub struct BeliefState {
    pub self_id: PlayerId,
    /// Multiplicity of each unseen card. Card has no instance id, so we track
    /// counts (1 or 2) rather than instances.
    pub unseen: HashMap<Card, u8>,
    /// For each player, the (suit, rank) values they provably cannot hold.
    /// Indexed by PlayerId; self's slot is the full unseen-card-key set.
    pub cannot_hold: Vec<HashSet<Card>>,
    /// Remaining hand size per player.
    pub hand_sizes: Vec<usize>,
    /// Soft prior: per-player multiplicative weight for each card (default 1.0).
    /// Higher weights bias the sampler toward assigning that card to that player.
    /// Hard constraints (cannot_hold, capacity) ALWAYS dominate.
    pub soft_prior: Vec<HashMap<Card, f64>>,
}

/// Counts copies of each card in a slice.
fn multiset(cards: &[Card]) -> HashMap<Card, u8> {
    let mut m = HashMap::new();
    for c in cards { *m.entry(*c).or_insert(0u8) += 1; }
    m
}

impl BeliefState {
    /// Construct from initial deal: self's hand known, opponents' hands unknown.
    /// `all_cards` is the full 65-card deck.
    pub fn new(self_id: PlayerId, self_hand: &[Card], all_cards: &[Card]) -> Self {
        let self_ms = multiset(self_hand);
        let all_ms = multiset(all_cards);
        let mut unseen: HashMap<Card, u8> = HashMap::new();
        for (card, all_count) in &all_ms {
            let mine = self_ms.get(card).copied().unwrap_or(0);
            let remaining = all_count.saturating_sub(mine);
            if remaining > 0 { unseen.insert(*card, remaining); }
        }
        let mut cannot_hold = vec![HashSet::new(); 5];
        // Self can't "hold" any unseen card — they're, by definition, not in our hand.
        cannot_hold[self_id as usize] = unseen.keys().copied().collect();
        let soft_prior = vec![HashMap::new(); 5];
        BeliefState {
            self_id,
            unseen,
            cannot_hold,
            hand_sizes: vec![13; 5],
            soft_prior,
        }
    }

    /// Apply an intent-tracker prior: bias the sampler toward configurations
    /// where the partner card is held by a player we suspect is on the caller's
    /// team. Higher P(p in caller team) → higher weight for that player holding
    /// the partner card. Symmetric: lower P → lower weight.
    ///
    /// Multiplier formula: `partner_card_weight(p) = exp(k * (P(team) - 0.5))`
    /// with k=2.0 by default, so a P=0.8 player gets ~1.8× weight, P=0.2 → ~0.55×.
    pub fn apply_intent_prior(
        &mut self,
        partner_card: Option<Card>,
        team_probs: &[f64; 5],
    ) {
        let Some(pc) = partner_card else { return };
        if !self.unseen.contains_key(&pc) { return; }
        // Only one card type benefits from this — the partner card itself.
        // Sampling that card to a likely-ally is the main mechanism by which
        // intent inference biases search.
        const K: f64 = 2.0;
        for p in 0..5u8 {
            if p == self.self_id { continue; }
            let prob = team_probs[p as usize];
            let multiplier = (K * (prob - 0.5)).exp();
            let entry = self.soft_prior[p as usize].entry(pc).or_insert(1.0);
            *entry *= multiplier;
        }
    }

    /// Apply a bid-strength prior: a player who bid `bid_amount` is more likely
    /// to hold high cards (aces, Q♠, kings) and a long suit. We bump their
    /// per-card weights proportional to bid strength above MIN_BID.
    ///
    /// Soft signal — sampler will still respect hard constraints absolutely;
    /// these only break ties between otherwise-feasible assignments.
    pub fn apply_bid_strength_prior(&mut self, player: PlayerId, bid_amount: u16) {
        if player == self.self_id { return; }
        let above_min = bid_amount.saturating_sub(150) as f64;
        if above_min <= 0.0 { return; }
        // Scale: at bid 150 → 1.0× (no bump). At bid 250 → 2.0× on top cards.
        let strength = 1.0 + above_min / 100.0;
        let entry = &mut self.soft_prior[player as usize];
        for card in self.unseen.keys() {
            let bump = match (card.suit, card.rank) {
                (Suit::S, 12) => strength * 1.5,    // Q♠
                (_, 14) => strength * 1.3,           // Ace
                (_, 13) => strength * 1.15,          // King
                _ => 1.0,
            };
            if bump > 1.0 {
                *entry.entry(*card).or_insert(1.0) *= bump;
            }
        }
    }

    /// A card was played by `player`. Decrement unseen count by 1; decrement hand size.
    pub fn on_play(&mut self, player: PlayerId, card: Card) {
        if let Some(count) = self.unseen.get_mut(&card) {
            *count = count.saturating_sub(1);
            if *count == 0 {
                self.unseen.remove(&card);
                for set in self.cannot_hold.iter_mut() {
                    set.remove(&card);
                }
            }
        }
        if (player as usize) < self.hand_sizes.len() {
            self.hand_sizes[player as usize] = self.hand_sizes[player as usize].saturating_sub(1);
        }
    }

    /// `player` failed to follow `led_suit`. They hold zero cards of that suit.
    pub fn on_non_follow(&mut self, player: PlayerId, led_suit: Suit) {
        let blocked: Vec<Card> = self.unseen.keys()
            .copied()
            .filter(|c| c.suit == led_suit)
            .collect();
        for c in blocked {
            self.cannot_hold[player as usize].insert(c);
        }
    }

    /// The caller declared a partner card — they cannot hold ALL copies.
    /// Conservative: we mark caller as unable to hold ANY remaining copy of the
    /// (suit, rank). When there are 2 copies, this can over-constrain by one
    /// copy; in practice the caller usually holds zero copies (most common case).
    pub fn on_declare(&mut self, caller: PlayerId, partner_card: Card) {
        if self.unseen.contains_key(&partner_card) {
            self.cannot_hold[caller as usize].insert(partner_card);
        }
    }

    /// Sample a complete assignment of unseen cards to opponent hands consistent
    /// with `cannot_hold` and `hand_sizes`. Returns None if unsatisfiable after
    /// the retry budget.
    pub fn sample_determinization(&self, rng: &mut GameRng) -> Option<Vec<Vec<Card>>> {
        const MAX_RESTARTS: u32 = 32;
        for _ in 0..MAX_RESTARTS {
            if let Some(h) = self.try_sample(rng) {
                return Some(h);
            }
        }
        None
    }

    fn try_sample(&self, rng: &mut GameRng) -> Option<Vec<Vec<Card>>> {
        let mut hands: Vec<Vec<Card>> = vec![Vec::new(); 5];
        let mut remaining_cap: Vec<i32> = (0..5).map(|p| {
            if p == self.self_id as usize { 0 } else { self.hand_sizes[p] as i32 }
        }).collect();

        // Flatten unseen multiset to instances; each copy assigned separately.
        let mut instances: Vec<Card> = Vec::new();
        for (card, &count) in &self.unseen {
            for _ in 0..count { instances.push(*card); }
        }

        // Most-constrained-first: cards with fewest eligible holders (across instances) come first.
        instances.sort_by_key(|c| {
            (0..5u8)
                .filter(|&p| p != self.self_id)
                .filter(|&p| !self.cannot_hold[p as usize].contains(c))
                .count()
        });
        // Within equal constraint groups, shuffle for variety.
        let mut i = 0;
        while i < instances.len() {
            let pivot_eligible = (0..5u8)
                .filter(|&p| p != self.self_id)
                .filter(|&p| !self.cannot_hold[p as usize].contains(&instances[i]))
                .count();
            let mut j = i + 1;
            while j < instances.len() {
                let n = (0..5u8)
                    .filter(|&p| p != self.self_id)
                    .filter(|&p| !self.cannot_hold[p as usize].contains(&instances[j]))
                    .count();
                if n != pivot_eligible { break; }
                j += 1;
            }
            instances[i..j].shuffle(rng);
            i = j;
        }

        for card in &instances {
            let eligible: Vec<PlayerId> = (0..5u8)
                .filter(|&p| p != self.self_id)
                .filter(|&p| !self.cannot_hold[p as usize].contains(card))
                .filter(|&p| remaining_cap[p as usize] > 0)
                .collect();
            if eligible.is_empty() { return None; }

            // Weighted sample using soft_prior (default weight = 1.0).
            let weights: Vec<f64> = eligible.iter()
                .map(|&p| self.soft_prior[p as usize].get(card).copied().unwrap_or(1.0))
                .collect();
            let total: f64 = weights.iter().sum();
            let r: f64 = rng.gen_range(0.0..total);
            let mut acc = 0.0;
            let mut chosen = eligible[0];
            for (i, &w) in weights.iter().enumerate() {
                acc += w;
                if r < acc { chosen = eligible[i]; break; }
            }

            hands[chosen as usize].push(*card);
            remaining_cap[chosen as usize] -= 1;
        }

        for p in 0..5 {
            if p == self.self_id as usize { continue; }
            if hands[p].len() != self.hand_sizes[p] { return None; }
        }
        Some(hands)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bq_engine::deck::build_deck;
    use bq_engine::rng::from_seed;

    #[test]
    fn new_belief_excludes_self_hand_from_unseen_count() {
        let all = build_deck();
        let mine: Vec<Card> = all[0..13].to_vec();
        let b = BeliefState::new(0, &mine, &all);
        let total_unseen: u32 = b.unseen.values().map(|&v| v as u32).sum();
        assert_eq!(total_unseen, (65 - 13) as u32);
        assert_eq!(b.hand_sizes, vec![13; 5]);
    }

    #[test]
    fn non_follow_eliminates_entire_suit_for_player() {
        let all = build_deck();
        // Give self only spades (so non-spade suits are entirely unseen).
        let mine: Vec<Card> = all.iter().filter(|c| c.suit == Suit::S).copied().take(13).collect();
        let mut b = BeliefState::new(0, &mine, &all);
        b.on_non_follow(2, Suit::H);
        for c in b.unseen.keys().filter(|c| c.suit == Suit::H) {
            assert!(b.cannot_hold[2].contains(c), "player 2 should not hold {:?}", c);
        }
    }

    #[test]
    fn play_decrements_count_and_hand_size() {
        let all = build_deck();
        let mine = all[0..13].to_vec();
        let mut b = BeliefState::new(0, &mine, &all);
        let card = *b.unseen.keys().next().unwrap();
        let before = b.unseen.get(&card).copied().unwrap();
        b.on_play(2, card);
        let after = b.unseen.get(&card).copied().unwrap_or(0);
        assert_eq!(after, before - 1);
        assert_eq!(b.hand_sizes[2], 12);
    }

    #[test]
    fn declare_marks_partner_card_as_unholdable_for_caller() {
        let all = build_deck();
        let mine = all[0..13].to_vec();
        let mut b = BeliefState::new(0, &mine, &all);
        let pc = *b.unseen.keys().next().unwrap();
        b.on_declare(3, pc);
        assert!(b.cannot_hold[3].contains(&pc));
    }

    #[test]
    fn sampler_produces_valid_assignment_at_game_start() {
        let all = build_deck();
        let mine = all[0..13].to_vec();
        let b = BeliefState::new(0, &mine, &all);
        let mut rng = from_seed(99);
        let hands = b.sample_determinization(&mut rng).expect("sampler should succeed");
        for p in 1..5 { assert_eq!(hands[p].len(), 13, "player {} hand size", p); }
    }

    #[test]
    fn sampler_respects_void_constraints() {
        let all = build_deck();
        let mine = all[0..13].to_vec();
        let mut b = BeliefState::new(0, &mine, &all);
        b.on_non_follow(2, Suit::H);
        let mut rng = from_seed(7);
        let hands = b.sample_determinization(&mut rng).expect("sampler should succeed");
        for c in &hands[2] {
            assert_ne!(c.suit, Suit::H, "player 2 must be void in hearts");
        }
    }
}
