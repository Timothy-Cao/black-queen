# How the strongest AI was built

A 5-player Black Queen game with hidden partnerships and bidding. Built three AI generations; the current strongest (Hard-3) wins ~57% of seats vs the rule-based baseline and ~61% vs the basic greedy bot.

## The approach in one line

A hand-crafted utility function with ~55 tunable scalars, refined by evolutionary search over millions of simulated games, with belief-propagation-style team inference layered on top.

## What's inside

**1. Tunable scoring function**
Every play is scored as expected team-captured-points minus the spend cost of the card, plus situational bonuses (smear toward known ally, penalty for feeding the enemy, special handling for the Queen of Spades, void-creation rewards for shedding a near-empty suit). ~55 scalar weights expose every magic number to optimization.

**2. Evolutionary tuning**
A (1+λ)-Evolution Strategy with self-adaptive sigma (1/5-success rule). Each generation samples 12 weight-vector mutations relative to the current best, evaluates them on 80–150 simulated games each, and promotes the strongest. Mirror-replay paired evaluation (every random seed is played twice with the personalities swapped) cancels out seat and shuffle variance.

**3. Multi-opponent fitness**
Fitness isn't just "beat the rule-based AI" — that opponent-overfits. The tuner runs each candidate against a *mix* of the locked baseline and the previous generation's tuned weights, so improvements have to generalize. A promotion gate blocks any candidate that regresses against the prior generation.

**4. Bayesian-style team inference**
Black Queen's defining feature is hidden partnerships. The strongest AI maintains a per-player probability of "is on the caller's team", updated from observed play patterns: a player who voluntarily feeds a high-point card to a trick they aren't winning is signaling whose side they're on. A threshold-gate promotes high-confidence inferences to "treat as confirmed ally / enemy."

**5. Generation pipeline**
Three selectable AI personalities live in production: **Hard** (locked rule-based baseline), **Hard-2** (first evolutionary refinement), **Hard-3** (added alliance inference + void-creation, re-tuned over 100 generations). Each generation's weights are archived as a versioned JSON and loaded into a distinct runtime slot.

## What didn't work (and why we kept trying)

- Single-opponent tuning *seemed* to produce stronger weights but opponent-overfit — candidates that beat the rule-based AI on training seeds lost head-to-head against the previous tuned generation. Switched to multi-opponent fitness with a non-regression promotion gate.
- Soft probability scaling of smear/feed signals (treating ally-probability as a gradient) regressed the AI because the weights were calibrated for binary gates. Reverted to threshold-gate integration.
- Belief propagation across unknowns (multi-hop inference) was implemented but moved the needle by ~0.06pp — kept in the codebase for future experimentation, off by default.

## How it was measured

Three harnesses, all reproducible from the CLI:
- **Arena** — N-game benchmark across personality mixes; ~3,500 games/sec throughput.
- **Tournament** — head-to-head matrix across every AI generation plus baselines, using mirror-replay paired evaluation.
- **A/B feature gates** — same-seed before/after comparison for any single feature, so behavior changes are isolated from variance.

End-to-end: every architectural change is gated by an A/B test before tuning, and every tuned candidate is validated against the full tournament on fresh seeds before shipping.

---

Total tuning compute: ~150k–200k simulated games per generation. Each game is a pure-reducer game engine called under seeded RNG so results are deterministic and parallelizable.
