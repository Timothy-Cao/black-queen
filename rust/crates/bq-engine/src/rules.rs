use crate::types::{Card, PlayerId, Suit, Trick};

/// Returns indices into `hand` that are legal plays. Mirrors `legalPlays` in src/game/rules.ts.
pub fn legal_play_indices(hand: &[Card], trick: Option<&Trick>) -> Vec<usize> {
    match trick {
        None => (0..hand.len()).collect(),
        Some(t) if t.plays.is_empty() => (0..hand.len()).collect(),
        Some(t) => {
            let led = t.plays[0].card.suit;
            let following: Vec<usize> = hand.iter().enumerate()
                .filter(|(_, c)| c.suit == led)
                .map(|(i, _)| i)
                .collect();
            if following.is_empty() { (0..hand.len()).collect() } else { following }
        }
    }
}

/// Trick winner. Highest trump wins; if no trump, highest of led suit. Off-suit non-trump never wins.
/// Mirrors `trickWinner` in src/game/rules.ts. If `trump` is None, treated as no-trump.
pub fn trick_winner(trick: &Trick, trump: Option<Suit>) -> PlayerId {
    assert!(!trick.plays.is_empty(), "trick_winner called with empty trick");
    let led = trick.plays[0].card.suit;
    let mut best_idx = 0usize;
    for (i, p) in trick.plays.iter().enumerate().skip(1) {
        let best_card = &trick.plays[best_idx].card;
        let best_is_trump = trump.map_or(false, |t| best_card.suit == t);
        let play_is_trump = trump.map_or(false, |t| p.card.suit == t);
        if play_is_trump && !best_is_trump {
            best_idx = i;
        } else if play_is_trump && best_is_trump {
            if p.card.rank > best_card.rank { best_idx = i; }
        } else if !play_is_trump && !best_is_trump {
            if p.card.suit == led && p.card.rank > best_card.rank { best_idx = i; }
        }
        // else play is non-trump while best is trump -> best stays
    }
    trick.plays[best_idx].player
}

pub fn trick_points(trick: &Trick) -> u16 {
    trick.plays.iter().map(|p| p.card.points()).sum()
}

pub fn next_player(p: PlayerId) -> PlayerId {
    (p + 1) % 5
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Card, TrickPlay};

    fn c(s: Suit, r: u8) -> Card { Card { suit: s, rank: r } }
    fn tp(player: PlayerId, card: Card) -> TrickPlay { TrickPlay { player, card } }

    #[test]
    fn leading_allows_any_card() {
        let hand = vec![c(Suit::S, 10), c(Suit::H, 13)];
        let trick = Trick { leader: 0, plays: vec![], winner: None, points: None };
        assert_eq!(legal_play_indices(&hand, Some(&trick)), vec![0, 1]);
    }

    #[test]
    fn must_follow_suit_if_able() {
        let hand = vec![c(Suit::S, 10), c(Suit::H, 13), c(Suit::H, 9)];
        let trick = Trick {
            leader: 1,
            plays: vec![tp(1, c(Suit::H, 8))],
            winner: None, points: None,
        };
        assert_eq!(legal_play_indices(&hand, Some(&trick)), vec![1, 2]);
    }

    #[test]
    fn may_play_anything_when_void_in_led_suit() {
        let hand = vec![c(Suit::S, 10), c(Suit::H, 13)];
        let trick = Trick {
            leader: 1,
            plays: vec![tp(1, c(Suit::C, 8))],
            winner: None, points: None,
        };
        assert_eq!(legal_play_indices(&hand, Some(&trick)), vec![0, 1]);
    }

    #[test]
    fn trick_winner_highest_of_led_when_no_trump_played() {
        let trick = Trick {
            leader: 0,
            plays: vec![
                tp(0, c(Suit::H, 8)),
                tp(1, c(Suit::H, 14)),  // Ace
                tp(2, c(Suit::C, 13)),  // off-suit, ignored
                tp(3, c(Suit::H, 10)),
                tp(4, c(Suit::H, 11)),
            ],
            winner: None, points: None,
        };
        assert_eq!(trick_winner(&trick, Some(Suit::S)), 1);
    }

    #[test]
    fn highest_trump_wins_over_higher_led_suit() {
        let trick = Trick {
            leader: 0,
            plays: vec![
                tp(0, c(Suit::H, 14)),  // strong led
                tp(1, c(Suit::S, 5)),   // weak trump
                tp(2, c(Suit::H, 13)),
                tp(3, c(Suit::S, 8)),   // higher trump
                tp(4, c(Suit::H, 12)),
            ],
            winner: None, points: None,
        };
        assert_eq!(trick_winner(&trick, Some(Suit::S)), 3);
    }

    #[test]
    fn no_trump_played_means_off_suit_loses() {
        let trick = Trick {
            leader: 0,
            plays: vec![
                tp(0, c(Suit::D, 7)),
                tp(1, c(Suit::D, 14)),
                tp(2, c(Suit::C, 14)), // off-suit
                tp(3, c(Suit::D, 5)),
                tp(4, c(Suit::H, 14)), // off-suit
            ],
            winner: None, points: None,
        };
        assert_eq!(trick_winner(&trick, Some(Suit::S)), 1);
    }

    #[test]
    fn trick_points_sums_card_values() {
        let trick = Trick {
            leader: 0,
            plays: vec![
                tp(0, c(Suit::S, 12)),  // 30
                tp(1, c(Suit::H, 14)),  // 15
                tp(2, c(Suit::D, 10)),  // 10
                tp(3, c(Suit::C, 5)),   // 5
                tp(4, c(Suit::H, 11)),  // 0
            ],
            winner: None, points: None,
        };
        assert_eq!(trick_points(&trick), 60);
    }
}
