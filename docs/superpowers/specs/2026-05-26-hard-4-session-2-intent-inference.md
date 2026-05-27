# Hard-4 Session 2 — Opponent-intent Bayesian inference

**Branch:** `hard-4-session-2`
**Builds on:** [Session 1.7 notes](../sessions/2026-05-26-hard-4-session-1-6-notes.md) — Hard-4 baseline is +0.7–3.5pp vs Hard-3 in mirror replay, effectively tied at +0.68pp at 500 mirror pairs.

## Goal

Make Hard-4 decisively beat Hard-3 by adding **continuous Bayesian inference of each opponent's team alignment** from observable card-play signals. Replace the failed naive bid-strength prior with a calibrated multi-signal tracker that scales each observation's strength by the player's *voluntariness* — whether they could have played differently.

## Hypothesis

Hard-3's existing alliance inference is a binary threshold gate (a player crosses 0.85 confidence → treated as confirmed ally/enemy; otherwise unknown). A continuous, multi-signal Bayesian version is strictly more information. It feeds two consumers in Hard-4:

1. **Determinization sampler** — bias which configurations of opponent hands we sample (e.g., the partner card is more likely in a player we suspect is on caller team)
2. **Tactical rollout** — when team alignment is uncertain, use inferred probabilities to make rollout smear/dump decisions

Both consumers already exist; we just feed them better data.

## Signals (calibrated log-likelihood ratios)

Each observed play updates per-player `LLR(p)` = `log[ P(obs | p on caller team) / P(obs | p opponent) ]`.

Posterior `P(p in caller team) = sigmoid(LLR(p))`. We start each opponent at LLR=0 (50/50 prior; the caller is known with certainty, partner-card holders we've seen play it are known with certainty).

**Voluntariness** is the multiplier. A player following suit with their only point card is forced — no signal. A player choosing to play a 10 when they also held a 9 of the same suit is deliberate — full-strength signal.

| Signal | Magnitude (LLR delta, defaults) | Voluntariness check |
|---|---|---|
| Plays a point card (5/10/A) onto a trick currently winning by caller-team | **+0.4 per 5 pts** of the card | Had a 0-point legal alternative |
| Plays Q♠ onto a trick winning by caller-team | **+2.0** | Had a 0-point legal alternative (Q♠ is 30 pts, the strongest signal in the deck) |
| Plays a point card onto a trick winning by *known opposing-team* | **−0.4 per 5 pts** | Had a 0-point legal alternative |
| Could have fed (held a point card) but played a 0-pointer instead, when trick going to caller-team | **−0.3** | Held ≥1 legal point card |
| Could have fed but didn't, when trick going to known opposing-team | **+0.3** | Held ≥1 legal point card |
| Trumps a trick caller-team was winning, when had a non-trump legal alternative | **−1.0** | Held ≥1 legal non-trump |
| Trumps a trick *known opposing-team* was winning, when had non-trump | **+1.0** | Held ≥1 legal non-trump |
| Wins a trick they could have ducked (played lower) when caller-team had the points | **−0.5** | Had a lower-rank legal alternative that wouldn't win |
| Ducks (plays low losing card) when winning would have taken points from caller-team | **−0.3** | Held ≥1 legal winning card |

All magnitudes are tunable scalars in `HardWeights` analog for Hard-4. Defaults set conservatively; ES tuning is a future task.

**LLR clamping**: capped at ±3.0 per player to prevent runaway from any single misjudged signal.

## Architecture

```
src/game/
  (TS engine, unchanged)

rust/crates/bq-ai/src/
  intent.rs              ← NEW: IntentTracker, signal definitions, voluntariness checks
  belief.rs              ← MODIFY: accept IntentTracker as soft prior input
  rollout.rs             ← MODIFY: use inferred team prob when alignment uncertain
  hard4.rs               ← MODIFY: build IntentTracker from played-trick history,
                                   pass to belief + rollout
```

### IntentTracker public API

```rust
pub struct IntentTracker {
    /// LLR per player. Indexed by PlayerId.
    pub llr: [f64; 5],
    /// "Known with certainty" overrides (caller and revealed partners).
    pub confirmed: [Option<TeamLabel>; 5],
}

pub enum TeamLabel { Caller, Opposing }

impl IntentTracker {
    pub fn new(caller: PlayerId) -> Self;
    pub fn note_trick(&mut self, completed_trick: &Trick, ...);
    pub fn observe_play(&mut self, player: PlayerId, card: Card,
                        hand_before_play: &[Card],
                        trick_before_play: &Trick,
                        trump: Option<Suit>);
    /// Posterior probability that p is on the caller's team.
    pub fn p_on_caller_team(&self, p: PlayerId) -> f64;
}
```

### Integration points

1. **`hard4_play` in `hard4.rs`** — builds an `IntentTracker` from `state.bids`/`state.tricks`/`state.current_trick`. Passes it to belief construction and ISMCTS params.
2. **`BeliefState::apply_intent_prior`** — converts intent LLRs into per-player card weight multipliers for the determinization sampler. Players more likely to be on caller-team get higher prior weights for cards that are good for the caller-team strategy.
3. **`rollout_tactical`** — replaces full-info team identification with a *posterior* team identification at the rollout root, then uses full info inside determinization (since the determinization makes opponent hands known).

The clever wiring: inside a determinization, team membership IS known (partner card location is sampled). The intent tracker's role is to **bias which determinizations we sample** so that more samples reflect the AI's actual posterior beliefs about who's on which team.

## Measurement

Mirror-replay arena, 500 seed pairs (1000 games) per A/B point.

### Per-signal A/B

For each signal individually, run with that signal alone enabled (others gated off via env vars):
- `BQ_INTENT_SMEAR=1` — point-feed signal only
- `BQ_INTENT_WITHHOLD=1` — withhold-when-could-feed signal only
- `BQ_INTENT_TRUMP=1` — defensive-trump signal only
- `BQ_INTENT_DUCK=1` — duck-when-could-win signal only
- `BQ_INTENT_ALL=1` — all signals combined

For each, measure mirror-arena edge vs Hard-3. Keep only the signals that show positive contribution at calibrated defaults. Combine winners.

### Acceptance criteria

- Smoketest: 0 illegal plays over ≥5000 games.
- Mirror-replay arena (500 pairs): Hard-4 with intent enabled shows ≥+2pp vs Hard-3, AND ≥+1pp vs Hard-4 baseline (intent disabled).
- Browser sanity check: Hard-4 plays a full game in-app without crashes.

## Non-goals

- Multi-hop inference ("if A is on team, by elimination B is...") — Hard-3 tried this; +0.06pp; skip.
- Modeling opponent strategy as a mixture over personality types — combinatorial blowup, defer.
- Tracking *which specific cards* a player holds based on play order — too speculative.
- ES tuning the LLR magnitudes — this is a Session 3 task if Session 2 ships positive.

## Files

**New:**
- `rust/crates/bq-ai/src/intent.rs`
- `rust/crates/bq-ai/src/lib.rs` (register module)

**Modified:**
- `rust/crates/bq-ai/src/belief.rs` — `apply_intent_prior` method
- `rust/crates/bq-ai/src/rollout.rs` — use posterior team in tactical rollout
- `rust/crates/bq-ai/src/hard4.rs` — build IntentTracker, wire through

**Untouched (intentionally):**
- All TS code (engine, UI, dispatchers)
- All other personalities
- Existing belief/sampler hard constraints (only adding soft prior)

## Risks

- **Signals may be uncalibrated at defaults.** Mitigation: A/B each individually, then combine; ES tune in a follow-up session.
- **Inference may be slow per move.** Mitigation: signal computation is O(plays seen) per move, well under 1ms even at endgame.
- **The "voluntariness" check requires reconstructing hand-before-play.** Mitigation: replay forward from initial deal during hard4_play setup; ~13 trick replays max per move; cheap.
