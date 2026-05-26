use serde::{Deserialize, Serialize};

/// Single-letter suit codes match the TS side: S/H/D/C.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, PartialOrd, Ord)]
pub enum Suit {
    S, // Spades
    H, // Hearts
    D, // Diamonds
    C, // Clubs
}

impl Suit {
    pub const ALL: [Suit; 4] = [Suit::S, Suit::H, Suit::D, Suit::C];
}

/// Numeric ranks 2..=14; 11=J, 12=Q, 13=K, 14=A. The 2/3/4/6 are never in our deck
/// but the type space mirrors TS.
pub type Rank = u8;

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Card {
    pub suit: Suit,
    pub rank: Rank,
}

impl Card {
    pub fn points(&self) -> u16 {
        match (self.suit, self.rank) {
            (Suit::S, 12) => 30,
            (_, 14) => 15,
            (_, 10) => 10,
            (_, 5)  => 5,
            _ => 0,
        }
    }
}

pub type PlayerId = u8; // 0..5

#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Bidding,
    Declaring,
    Playing,
    Done,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BidEntry {
    pub player: PlayerId,
    /// None or 0 = pass.
    pub amount: Option<u16>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TrickPlay {
    pub player: PlayerId,
    pub card: Card,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Trick {
    pub leader: PlayerId,
    pub plays: Vec<TrickPlay>,
    #[serde(default)]
    pub winner: Option<PlayerId>,
    #[serde(default)]
    pub points: Option<u16>,
}

/// Slim AI-facing game state. The TS side has more (UI, history); the driver
/// projects only the fields the AI needs.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GameState {
    pub phase: Phase,
    /// hands[player_id] = remaining cards. AI's own hand is always populated;
    /// opponents may be empty (their cards are unknown to the AI).
    pub hands: Vec<Vec<Card>>,
    pub bids: Vec<BidEntry>,
    pub caller: Option<PlayerId>,
    pub winning_bid: Option<u16>,
    pub trump: Option<Suit>,
    pub partner_card: Option<Card>,
    pub tricks: Vec<Trick>,
    pub current_trick: Option<Trick>,
    pub next_to_act: PlayerId,
    pub captured_points: Vec<u16>,
    pub passed: Vec<bool>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn point_card_values_match_rules() {
        assert_eq!(Card { suit: Suit::S, rank: 12 }.points(), 30);
        assert_eq!(Card { suit: Suit::H, rank: 14 }.points(), 15);
        assert_eq!(Card { suit: Suit::D, rank: 10 }.points(), 10);
        assert_eq!(Card { suit: Suit::C, rank:  5 }.points(),  5);
        assert_eq!(Card { suit: Suit::S, rank: 11 }.points(),  0);
        assert_eq!(Card { suit: Suit::H, rank: 12 }.points(),  0); // only S-Q is 30
    }

    #[test]
    fn suit_serializes_as_single_letter() {
        let s = serde_json::to_string(&Suit::S).unwrap();
        assert_eq!(s, "\"S\"");
        let h: Suit = serde_json::from_str("\"H\"").unwrap();
        assert_eq!(h, Suit::H);
    }

    #[test]
    fn card_round_trips_json() {
        let c = Card { suit: Suit::D, rank: 10 };
        let j = serde_json::to_string(&c).unwrap();
        assert_eq!(j, r#"{"suit":"D","rank":10}"#);
        let back: Card = serde_json::from_str(&j).unwrap();
        assert_eq!(back, c);
    }
}
