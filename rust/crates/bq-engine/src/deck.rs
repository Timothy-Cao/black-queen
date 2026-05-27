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
