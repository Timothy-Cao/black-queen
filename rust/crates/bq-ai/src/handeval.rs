//! Hand-strength evaluator — used by Hard-4 to bid and declare.
//!
//! Mirrors the structure of TS `evaluateHand` in src/game/ai.ts but ported to
//! Rust for sync access during ISMCTS planning. Heuristic scoring; no learning.
//!
//! Outputs:
//!   - best_trump_suit: which suit makes the strongest trump
//!   - estimate_capture: rough expected captured points if we win the bid
//!   - per-suit trump-strength scores (for inspection / tie-breaks)

use bq_engine::types::{Card, Suit};

pub struct HandEval {
    pub best_trump: Suit,
    pub estimate_capture: u16,
    pub trump_strength: [(Suit, f64); 4],
}

/// Port of Hard-3's `estimateBidCapacity` (aiHard.ts:464) with calibrated weights.
/// Returns expected captured points if we win the bid with `best_trump`.
/// More accurate than `estimate_capture`; used for bid decisions.
pub fn estimate_bid_capacity(hand: &[Card]) -> u16 {
    let eval = evaluate_hand(hand);
    let trump = eval.best_trump;
    let trump_score = eval.trump_strength.iter()
        .find(|(s, _)| *s == trump)
        .map(|(_, v)| *v)
        .unwrap_or(0.0);

    let my_points: f64 = hand.iter().map(|c| c.points() as f64).sum();
    let trump_points: f64 = hand.iter().filter(|c| c.suit == trump).map(|c| c.points() as f64).sum();

    // Self-capture estimate (calibrated weights, matching Hard-3 defaults).
    let mut self_capture = my_points * 0.55
        + trump_points * 0.15
        + (trump_score * 0.18).min(60.0);

    // Trump control: top trumps + length over 4.
    let top_trumps = hand.iter().filter(|c| c.suit == trump && c.rank >= 12).count() as f64;
    let trump_len = hand.iter().filter(|c| c.suit == trump).count() as f64;
    let mut trump_control = top_trumps * 8.0;
    if trump_len >= 5.0 { trump_control += (trump_len - 4.0) * 7.0; }

    // Voids/singletons in side suits.
    let mut void_bonus = 0.0;
    for &s in &Suit::ALL {
        if s == trump { continue; }
        let n = hand.iter().filter(|c| c.suit == s).count();
        if n == 0 { void_bonus += 14.0; }
        else if n == 1 { void_bonus += 4.0; }
    }

    // Partner-help expectation.
    let aces_held = hand.iter().filter(|c| c.rank == 14).count();
    let qs_held = hand.iter().filter(|c| c.suit == Suit::S && c.rank == 12).count();
    let mut partner_bonus = 30.0;
    if aces_held <= 2 { partner_bonus += 10.0; }
    if qs_held == 0 { partner_bonus += 8.0; }

    // Side-suit point protection.
    let mut protection = 0.0;
    for c in hand {
        if c.points() == 0 || c.suit == trump { continue; }
        let side_top = hand.iter().filter(|x| x.suit == c.suit && x.rank >= 13).count();
        if side_top > 0 { protection += 5.0; }
    }

    // Risk penalties.
    let mut risk = 0.0;
    let mut lengths: Vec<usize> = Suit::ALL.iter()
        .map(|&s| hand.iter().filter(|c| c.suit == s).count())
        .collect();
    lengths.sort_unstable_by(|a, b| b.cmp(a));
    if lengths[0] <= 4 { risk += 30.0; }
    if top_trumps == 0.0 { risk += 20.0; }
    if lengths[3] >= 2 && lengths[0] - lengths[3] <= 1 { risk += 25.0; }

    // Self-capture is reduced by risk too (calibration tweak vs naive).
    self_capture -= risk * 0.3;

    let capacity = self_capture + trump_control + void_bonus + partner_bonus + protection;
    let capped = capacity.clamp(0.0, 300.0);
    capped.round() as u16
}

pub fn evaluate_hand(hand: &[Card]) -> HandEval {
    let my_points: u16 = hand.iter().map(|c| c.points()).sum();
    let mut trump_strength: [(Suit, f64); 4] = [
        (Suit::S, 0.0), (Suit::H, 0.0), (Suit::D, 0.0), (Suit::C, 0.0),
    ];

    for (i, &suit) in Suit::ALL.iter().enumerate() {
        let cards_in_suit: Vec<&Card> = hand.iter().filter(|c| c.suit == suit).collect();
        let length = cards_in_suit.len() as f64;
        let top_ranks = cards_in_suit.iter().filter(|c| c.rank >= 12).count() as f64;
        let aces_in_suit = cards_in_suit.iter().filter(|c| c.rank == 14).count() as f64;
        let kings_in_suit = cards_in_suit.iter().filter(|c| c.rank == 13).count() as f64;

        // Aces+kings off-suit are also valuable as side-suit controls.
        let other_top = hand.iter().filter(|c| c.suit != suit && c.rank >= 13).count() as f64;

        let top_control_bonus =
            if aces_in_suit >= 2.0 && kings_in_suit >= 2.0 { 25.0 } else { 0.0 }
            + aces_in_suit * 6.0
            + kings_in_suit * 3.0;

        // Point potential: trump points + side-suit-control point estimate.
        let point_potential: f64 = hand.iter().map(|c| {
            let in_trump = c.suit == suit;
            let cp = c.points() as f64;
            if in_trump {
                cp + if c.rank >= 13 { 10.0 } else { 0.0 }
            } else if c.rank >= 13 {
                cp / 2.0 + 4.0
            } else {
                0.0
            }
        }).sum();

        // Voids and near-voids in side suits — give us cutting power as trump.
        let voids_bonus = Suit::ALL.iter()
            .filter(|&&s2| s2 != suit && hand.iter().all(|c| c.suit != s2))
            .count() as f64 * 12.0;
        let near_voids_bonus = Suit::ALL.iter()
            .filter(|&&s2| s2 != suit && hand.iter().filter(|c| c.suit == s2).count() == 1)
            .count() as f64 * 4.0;

        trump_strength[i] = (
            suit,
            length * 4.0 + top_ranks * 8.0 + other_top * 5.0
                + point_potential + voids_bonus + near_voids_bonus + top_control_bonus,
        );
    }

    let (best_trump, best_score) = *trump_strength.iter()
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        .unwrap();

    // Same calibration as TS evaluateHand.
    let estimate = (100.0 + best_score * 1.05 + my_points as f64 * 0.3).clamp(120.0, 280.0);

    HandEval {
        best_trump,
        estimate_capture: estimate.round() as u16,
        trump_strength,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn c(s: Suit, r: u8) -> Card { Card { suit: s, rank: r } }

    #[test]
    fn strong_spades_picks_spades_as_trump() {
        let hand = vec![
            c(Suit::S, 14), c(Suit::S, 13), c(Suit::S, 12), c(Suit::S, 11), c(Suit::S, 10), c(Suit::S, 9),
            c(Suit::H, 14), c(Suit::D, 5),  c(Suit::D, 8),
            c(Suit::C, 14), c(Suit::C, 13), c(Suit::C, 10), c(Suit::C, 5),
        ];
        let e = evaluate_hand(&hand);
        assert_eq!(e.best_trump, Suit::S);
        assert!(e.estimate_capture >= 180, "got {}", e.estimate_capture);
    }

    #[test]
    fn weak_scattered_hand_estimates_low() {
        let hand = vec![
            c(Suit::S, 5), c(Suit::S, 7), c(Suit::S, 8),
            c(Suit::H, 5), c(Suit::H, 8), c(Suit::H, 9),
            c(Suit::D, 5), c(Suit::D, 8), c(Suit::D, 9), c(Suit::D, 10),
            c(Suit::C, 5), c(Suit::C, 8), c(Suit::C, 9),
        ];
        let e = evaluate_hand(&hand);
        assert!(e.estimate_capture <= 160, "got {}", e.estimate_capture);
    }
}
