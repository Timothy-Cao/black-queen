use crate::rng::GameRng;
use crate::types::{Card, Suit};
use rand::seq::SliceRandom;

/// 65-card Black Queen deck: two standard decks with 2/3/4/6/7 removed,
/// then exactly one 7♠ added back. Verified at build:
///   - 4 suits × 8 ranks {5,8,9,10,J,Q,K,A} × 2 copies = 64
///   - + 1×7♠ = 65 cards, 300 total points.
pub fn build_deck() -> Vec<Card> {
    let ranks_full: [u8; 8] = [5, 8, 9, 10, 11, 12, 13, 14];
    let mut deck = Vec::with_capacity(65);
    for _ in 0..2 {
        for &suit in &Suit::ALL {
            for &rank in &ranks_full {
                deck.push(Card { suit, rank });
            }
        }
    }
    deck.push(Card { suit: Suit::S, rank: 7 });
    debug_assert_eq!(deck.len(), 65);
    deck
}

pub fn shuffle_seeded(deck: &mut [Card], rng: &mut GameRng) {
    deck.shuffle(rng);
}

/// Deal in round-robin order. Each of 5 players gets 13 cards.
pub fn deal_hands(deck: Vec<Card>) -> Vec<Vec<Card>> {
    assert_eq!(deck.len(), 65);
    let mut hands: Vec<Vec<Card>> = (0..5).map(|_| Vec::with_capacity(13)).collect();
    for (i, card) in deck.into_iter().enumerate() {
        hands[i % 5].push(card);
    }
    hands
}

/// Parameterized deal — interpolates between "light" (heavily biased hands with
/// a dominant suit + near-void) and "full" (uniformly random).
///   intensity = 0 → light: dominant×5, weak×0.4, neutral×1
///   intensity = 1 → full:  uniform — same distribution as `deal_hands`
/// Linear blend in between.
///
/// Mirrors `deal5pLight` in src/game/deck.ts. The shuffled `deck` argument
/// provides the iteration order; assignment to each player is weighted-random
/// using the supplied RNG. Always returns 13 cards per player.
pub fn deal_hands_light(deck: Vec<Card>, intensity: f64, rng: &mut GameRng) -> Vec<Vec<Card>> {
    use rand::Rng;
    assert_eq!(deck.len(), 65);
    let t = intensity.clamp(0.0, 1.0);
    // Linear blend between light extremes (5, 0.4) and uniform (1, 1).
    let dominant_w = 5.0 + (1.0 - 5.0) * t;
    let weak_w = 0.4 + (1.0 - 0.4) * t;
    // (neutral weight is always 1.0)

    // Five favored suits, one doubled; assigned to players in a random order.
    let mut suits = Suit::ALL.to_vec();
    suits.shuffle(rng);
    let extra_idx: usize = rng.gen_range(0..4);
    let dominant_list: [Suit; 5] = [suits[0], suits[1], suits[2], suits[3], suits[extra_idx]];
    let mut player_order: [usize; 5] = [0, 1, 2, 3, 4];
    player_order.shuffle(rng);
    let mut player_dominant: [Suit; 5] = [Suit::S; 5];
    let mut player_weak: [Suit; 5] = [Suit::S; 5];
    for i in 0..5 {
        let p = player_order[i];
        player_dominant[p] = dominant_list[i];
        let others: Vec<Suit> = Suit::ALL.iter().copied()
            .filter(|s| *s != player_dominant[p]).collect();
        let pick: usize = rng.gen_range(0..others.len());
        player_weak[p] = others[pick];
    }

    let mut hands: Vec<Vec<Card>> = (0..5).map(|_| Vec::with_capacity(13)).collect();
    for card in deck {
        let mut weights = [0.0f64; 5];
        let mut total = 0.0;
        for i in 0..5 {
            let w = if hands[i].len() >= 13 { 0.0 }
                else if card.suit == player_dominant[i] { dominant_w }
                else if card.suit == player_weak[i] { weak_w }
                else { 1.0 };
            weights[i] = w;
            total += w;
        }
        let mut r: f64 = rng.gen_range(0.0..total.max(f64::MIN_POSITIVE));
        let mut chosen = 4usize;
        for i in 0..5 {
            r -= weights[i];
            if r <= 0.0 { chosen = i; break; }
        }
        hands[chosen].push(card);
    }

    // Safety re-balance: any hand under 13 borrows from the largest.
    for i in 0..5 {
        while hands[i].len() < 13 {
            let (biggest_idx, biggest_len) = hands.iter().enumerate()
                .map(|(idx, h)| (idx, h.len()))
                .max_by_key(|&(_, len)| len)
                .unwrap_or((0, 0));
            if biggest_len <= hands[i].len() { break; }
            let card = hands[biggest_idx].pop().unwrap();
            hands[i].push(card);
        }
        while hands[i].len() > 13 {
            let smallest = hands.iter().enumerate()
                .filter(|(idx, h)| *idx != i && h.len() < 13)
                .map(|(idx, h)| (idx, h.len()))
                .min_by_key(|&(_, len)| len);
            match smallest {
                Some((idx, _)) => {
                    let card = hands[i].pop().unwrap();
                    hands[idx].push(card);
                }
                None => break,
            }
        }
    }
    hands
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rng::from_seed;

    #[test]
    fn deck_has_65_cards() {
        assert_eq!(build_deck().len(), 65);
    }

    #[test]
    fn deck_total_points_is_300() {
        let total: u16 = build_deck().iter().map(|c| c.points()).sum();
        assert_eq!(total, 300);
    }

    #[test]
    fn exactly_one_seven_of_spades_no_other_sevens() {
        let deck = build_deck();
        let sevens: Vec<_> = deck.iter().filter(|c| c.rank == 7).collect();
        assert_eq!(sevens.len(), 1);
        assert_eq!(sevens[0].suit, Suit::S);
    }

    #[test]
    fn no_low_ranks_in_deck() {
        let deck = build_deck();
        for c in &deck {
            assert!(!matches!(c.rank, 2 | 3 | 4 | 6), "stray low rank in deck: {:?}", c);
        }
    }

    #[test]
    fn shuffle_is_deterministic_per_seed() {
        let mut a = build_deck();
        let mut b = build_deck();
        shuffle_seeded(&mut a, &mut from_seed(42));
        shuffle_seeded(&mut b, &mut from_seed(42));
        assert_eq!(a, b);
    }

    #[test]
    fn shuffle_differs_across_seeds() {
        let mut a = build_deck();
        let mut b = build_deck();
        shuffle_seeded(&mut a, &mut from_seed(1));
        shuffle_seeded(&mut b, &mut from_seed(2));
        assert_ne!(a, b);
    }

    #[test]
    fn deal_gives_each_player_13() {
        let hands = deal_hands(build_deck());
        assert_eq!(hands.len(), 5);
        for h in &hands {
            assert_eq!(h.len(), 13);
        }
    }
}
