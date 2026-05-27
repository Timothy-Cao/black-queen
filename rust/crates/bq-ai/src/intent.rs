//! Opponent-intent Bayesian inference.
//!
//! For each opponent of the AI (not the caller, not yet-revealed partners),
//! maintain a log-likelihood ratio (LLR) for "is on caller team" vs
//! "is opposing team". Each observed play in the trick history contributes a
//! calibrated LLR delta scaled by *voluntariness*: the player had a meaningful
//! alternative that would have signaled the opposite team allegiance.
//!
//! Posterior team probability: P(p on caller team) = sigmoid(LLR(p)).
//!
//! Consumers:
//! - belief.rs: biases determinization sampling toward more-likely hand configs
//! - rollout.rs: uses posterior team identity when rollout assignment uncertain

use bq_engine::rules::trick_winner;
use bq_engine::types::{Card, PlayerId, Suit, Trick, TrickPlay};

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum TeamLabel { Caller, Opposing }

/// LLR magnitudes — defaults tuned conservatively. Each is a separate scalar
/// so they can be A/B tested and ES-tuned individually.
#[derive(Clone, Debug)]
pub struct IntentWeights {
    /// Per-5pts of a point card voluntarily fed to a caller-team-winning trick.
    pub w_voluntary_feed_to_caller: f64,
    /// Bonus for feeding Q♠ (30pts) — strong intentional signal.
    pub w_voluntary_q_spades_to_caller: f64,
    /// Per-5pts voluntarily fed to a known-opposing-team-winning trick (anti-ally).
    pub w_voluntary_feed_to_opposing: f64,
    /// Held ≥1 point card but played a 0-pointer when trick going to caller-team.
    pub w_withhold_from_caller: f64,
    /// Held ≥1 point card but played a 0-pointer when trick going to opposing.
    pub w_withhold_from_opposing: f64,
    /// Voluntarily trumped a caller-team-winning trick (had non-trump option).
    pub w_voluntary_trump_caller: f64,
    /// Voluntarily trumped an opposing-team-winning trick.
    pub w_voluntary_trump_opposing: f64,
    /// Voluntarily took a trick they could have ducked, points going to caller.
    pub w_voluntary_steal_from_caller: f64,
    /// Hard cap on per-player LLR to prevent runaway from any single bad signal.
    pub llr_clamp: f64,
}

impl Default for IntentWeights {
    fn default() -> Self {
        IntentWeights {
            w_voluntary_feed_to_caller: 0.40,
            w_voluntary_q_spades_to_caller: 2.00,
            w_voluntary_feed_to_opposing: 0.40,
            w_withhold_from_caller: 0.30,
            w_withhold_from_opposing: 0.30,
            w_voluntary_trump_caller: 1.00,
            w_voluntary_trump_opposing: 1.00,
            w_voluntary_steal_from_caller: 0.50,
            llr_clamp: 3.0,
        }
    }
}

#[derive(Clone, Debug)]
pub struct IntentTracker {
    pub caller: PlayerId,
    /// LLR per player. Higher → more likely on caller team.
    pub llr: [f64; 5],
    /// Hard overrides for known-team players (caller + revealed partners).
    pub confirmed: [Option<TeamLabel>; 5],
    pub weights: IntentWeights,
}

impl IntentTracker {
    pub fn new(caller: PlayerId, weights: IntentWeights) -> Self {
        let mut confirmed = [None; 5];
        confirmed[caller as usize] = Some(TeamLabel::Caller);
        IntentTracker { caller, llr: [0.0; 5], confirmed, weights }
    }

    /// Posterior probability that player is on the caller's team.
    pub fn p_on_caller_team(&self, p: PlayerId) -> f64 {
        if let Some(label) = self.confirmed[p as usize] {
            return match label {
                TeamLabel::Caller => 1.0,
                TeamLabel::Opposing => 0.0,
            };
        }
        sigmoid(self.llr[p as usize])
    }

    /// Mark a player as confirmed partner (they played the partner card).
    pub fn confirm_partner(&mut self, p: PlayerId) {
        self.confirmed[p as usize] = Some(TeamLabel::Caller);
    }

    /// Observe a single play and update LLRs accordingly.
    ///
    /// Arguments:
    /// - `player`: who is playing
    /// - `card`: what they're playing
    /// - `hand_before`: full hand of `player` immediately before this play
    /// - `trick_before`: state of the current trick BEFORE `card` was added
    /// - `trump`: trump suit
    /// - `partner_card`: the declared partner card (for partner-card recognition)
    pub fn observe_play(
        &mut self,
        player: PlayerId,
        card: Card,
        hand_before: &[Card],
        trick_before: &Trick,
        trump: Option<Suit>,
        partner_card: Option<Card>,
    ) {
        // 1) If this play reveals the player as a partner, confirm them.
        if let Some(pc) = partner_card {
            if card.suit == pc.suit && card.rank == pc.rank && player != self.caller {
                self.confirm_partner(player);
                return; // confirmed — no more probabilistic updates needed
            }
        }
        // Already confirmed → no updates.
        if self.confirmed[player as usize].is_some() { return; }

        // 2) Identify the current trick winner (the player whose card would currently win).
        let cur_winner = if trick_before.plays.is_empty() {
            // Leading the trick — no signal about feeding/withholding yet.
            return;
        } else {
            trick_winner(trick_before, trump)
        };

        // 3) Whose "team" the current winner is on, by AI's belief.
        let winner_team_label = self.team_label_of(cur_winner);
        // If winner team is unknown (mid-uncertainty), we still extract weaker signal
        // by treating winner as "probably caller team" or "probably opposing" based on
        // posterior > 0.7 / < 0.3. Otherwise skip (would be circular).
        let winner_on_caller = match winner_team_label {
            Some(TeamLabel::Caller) => true,
            Some(TeamLabel::Opposing) => false,
            None => {
                let p = self.p_on_caller_team(cur_winner);
                if p > 0.7 { true } else if p < 0.3 { false } else { return; }
            }
        };

        // 4) Compute alternatives the player COULD have played.
        let legal: Vec<Card> = legal_indices(hand_before, trick_before)
            .into_iter().map(|i| hand_before[i]).collect();
        if legal.len() <= 1 {
            // Forced — no signal.
            return;
        }

        let pts = card.points();
        let is_trump = trump.map_or(false, |t| card.suit == t);

        // Signal A: voluntary point feed (or non-feed when could have).
        let any_non_point_alt = legal.iter().any(|c| c.points() == 0);
        let any_point_alt = legal.iter().any(|c| c.points() > 0);

        if pts > 0 && any_non_point_alt {
            // Voluntary feed.
            let mag = (pts as f64 / 5.0) * self.weights.w_voluntary_feed_to_caller;
            let q_spades_bonus = if card.suit == Suit::S && card.rank == 12 {
                self.weights.w_voluntary_q_spades_to_caller
            } else { 0.0 };
            let delta = mag + q_spades_bonus;
            if winner_on_caller {
                self.bump(player, delta);
            } else {
                let mag_opp = (pts as f64 / 5.0) * self.weights.w_voluntary_feed_to_opposing;
                self.bump(player, -mag_opp);
            }
        } else if pts == 0 && any_point_alt {
            // Voluntary withhold.
            if winner_on_caller {
                self.bump(player, -self.weights.w_withhold_from_caller);
            } else {
                self.bump(player, self.weights.w_withhold_from_opposing);
            }
        }

        // Signal B: voluntary trumping when had non-trump alternative.
        if is_trump {
            let any_non_trump_alt = legal.iter().any(|c| !trump.map_or(false, |t| c.suit == t));
            if any_non_trump_alt {
                // Did this trump WIN the trick (after this play)?
                let mut hypo = trick_before.clone();
                hypo.plays.push(TrickPlay { player, card });
                let new_winner = trick_winner(&hypo, trump);
                let we_took = new_winner == player;
                if we_took {
                    // We trumped to take the trick away from the previous winner.
                    if winner_on_caller {
                        // Took points from caller — likely opposing.
                        self.bump(player, -self.weights.w_voluntary_trump_caller);
                    } else {
                        // Took points from opposing — likely caller-team.
                        self.bump(player, self.weights.w_voluntary_trump_opposing);
                    }
                }
            }
        }

        // Signal C: voluntary "steal" — won the trick with a non-trump high card when
        // a lower legal card would have ducked.
        if !is_trump && pts == 0 {
            // (point-card stealing is already covered by Signal A as voluntary feed)
            let mut hypo = trick_before.clone();
            hypo.plays.push(TrickPlay { player, card });
            let new_winner = trick_winner(&hypo, trump);
            if new_winner == player {
                // We took the trick with a low non-trump. Did we have a lower legal alternative?
                let could_duck = legal.iter().any(|c| {
                    if c.points() != 0 || c.suit != card.suit { return false; }
                    let mut hh = trick_before.clone();
                    hh.plays.push(TrickPlay { player, card: *c });
                    trick_winner(&hh, trump) != player
                });
                if could_duck {
                    // Took a trick with points going to whoever was previously winning.
                    // Magnitude depends on the trick points already on the table.
                    let trick_pts: u16 = trick_before.plays.iter().map(|p| p.card.points()).sum();
                    if trick_pts > 0 {
                        if winner_on_caller {
                            // Took points from caller team — likely opposing.
                            self.bump(player, -self.weights.w_voluntary_steal_from_caller);
                        } else {
                            self.bump(player, self.weights.w_voluntary_steal_from_caller);
                        }
                    }
                }
            }
        }
    }

    fn team_label_of(&self, p: PlayerId) -> Option<TeamLabel> {
        self.confirmed[p as usize]
    }

    fn bump(&mut self, p: PlayerId, delta: f64) {
        let v = self.llr[p as usize] + delta;
        self.llr[p as usize] = v.clamp(-self.weights.llr_clamp, self.weights.llr_clamp);
    }
}

fn sigmoid(x: f64) -> f64 { 1.0 / (1.0 + (-x).exp()) }

fn legal_indices(hand: &[Card], trick: &Trick) -> Vec<usize> {
    // Inline a copy of legal_play_indices to avoid taking trick by Option<&Trick>.
    use bq_engine::rules::legal_play_indices;
    legal_play_indices(hand, Some(trick))
}

#[cfg(test)]
mod tests {
    use super::*;
    use bq_engine::types::Suit;

    fn c(s: Suit, r: u8) -> Card { Card { suit: s, rank: r } }

    fn make_trick(plays: Vec<TrickPlay>) -> Trick {
        Trick { leader: plays.first().map(|p| p.player).unwrap_or(0), plays, winner: None, points: None }
    }

    #[test]
    fn forced_play_yields_no_signal() {
        let mut t = IntentTracker::new(0, IntentWeights::default());
        // Player 1 has only the H-K (must follow hearts).
        let hand = vec![c(Suit::H, 13)];
        let trick = make_trick(vec![TrickPlay { player: 0, card: c(Suit::H, 14) }]);
        t.observe_play(1, c(Suit::H, 13), &hand, &trick, Some(Suit::S), None);
        assert_eq!(t.llr[1], 0.0);
    }

    #[test]
    fn voluntary_feed_to_caller_bumps_positive() {
        let mut t = IntentTracker::new(0, IntentWeights::default());
        // Caller (0) led H-K, winning so far.
        // Player 1 has Ace-of-hearts (point card) and 8-of-hearts (non-point).
        let hand = vec![c(Suit::H, 14), c(Suit::H, 8)];
        let trick = make_trick(vec![TrickPlay { player: 0, card: c(Suit::H, 13) }]);
        // Player 1 voluntarily plays the Ace into caller's winning trick.
        // Note: Ace beats King, so winner shifts. But the SIGNAL is "fed a point card".
        // Wait — we evaluate vs trick_before, where caller IS winning.
        t.observe_play(1, c(Suit::H, 14), &hand, &trick, Some(Suit::S), None);
        // Ace=15pts, voluntary, into caller-winning trick → +0.40 * 3 = +1.2
        assert!(t.llr[1] > 0.0, "expected positive LLR, got {}", t.llr[1]);
    }

    #[test]
    fn q_spades_to_caller_is_strong_signal() {
        let mut t = IntentTracker::new(0, IntentWeights::default());
        // Caller (0) led S-K, winning the spade trick.
        // Player 1 has Q-of-spades and a low spade.
        let hand = vec![c(Suit::S, 12), c(Suit::S, 8)];
        let trick = make_trick(vec![TrickPlay { player: 0, card: c(Suit::S, 13) }]);
        t.observe_play(1, c(Suit::S, 12), &hand, &trick, Some(Suit::S), None);
        // Q♠ (30pts) → 6.0 from point-feed + 2.0 Q♠ bonus = 8.0 → clamped to +3.0
        assert!(t.llr[1] >= 2.5, "Q♠ should be very strong signal, got {}", t.llr[1]);
    }

    #[test]
    fn partner_card_play_confirms_team() {
        let mut t = IntentTracker::new(0, IntentWeights::default());
        let pc = c(Suit::H, 14);
        let hand = vec![pc, c(Suit::H, 8)];
        let trick = make_trick(vec![TrickPlay { player: 0, card: c(Suit::H, 13) }]);
        t.observe_play(1, pc, &hand, &trick, Some(Suit::S), Some(pc));
        assert_eq!(t.confirmed[1], Some(TeamLabel::Caller));
        assert_eq!(t.p_on_caller_team(1), 1.0);
    }

    #[test]
    fn caller_always_p1() {
        let t = IntentTracker::new(2, IntentWeights::default());
        assert_eq!(t.p_on_caller_team(2), 1.0);
    }

    #[test]
    fn unknown_opponent_starts_at_50_percent() {
        let t = IntentTracker::new(0, IntentWeights::default());
        let p = t.p_on_caller_team(3);
        assert!((p - 0.5).abs() < 0.01);
    }

    #[test]
    fn voluntary_trump_of_caller_winner_is_anti_ally() {
        let mut t = IntentTracker::new(0, IntentWeights::default());
        // Caller (0) led H-A, winning.
        // Player 1 has S-5 (trump) and H-7 (could have followed).
        // Wait — must follow suit. If they have H, can't trump.
        // Let's set up: player has D and S only (void in H).
        let hand = vec![c(Suit::S, 5), c(Suit::D, 8), c(Suit::D, 9)];
        let trick = make_trick(vec![TrickPlay { player: 0, card: c(Suit::H, 14) }]);
        t.observe_play(1, c(Suit::S, 5), &hand, &trick, Some(Suit::S), None);
        // Trumped caller's winning trick when had non-trump (D) alternatives.
        // Signal B: w_voluntary_trump_caller = 1.0; player took the trick → bumps -1.0.
        assert!(t.llr[1] <= -0.5, "expected negative LLR, got {}", t.llr[1]);
    }

    #[test]
    fn clamping_caps_runaway() {
        let mut t = IntentTracker::new(0, IntentWeights::default());
        // Bump 10 times — should clamp.
        for _ in 0..10 { t.bump(1, 1.0); }
        assert!(t.llr[1] <= t.weights.llr_clamp + 0.001);
        for _ in 0..20 { t.bump(1, -1.0); }
        assert!(t.llr[1] >= -t.weights.llr_clamp - 0.001);
    }
}
