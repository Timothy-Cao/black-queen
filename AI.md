# How the strongest AIs were built

A 5-player Black Queen game with hidden partnerships and bidding. Four AI generations live in production. The first three (Hard, Hard-2, Hard-3) are utility-function-based with hand-tuned + evolved scalar weights. The fourth (Hard-4) is a different paradigm entirely: Information-Set Monte Carlo Tree Search with a belief tracker, implemented in Rust and shipped to the browser via WASM.

## Generation 1–3: Hand-crafted utility function

### The approach in one line

A hand-crafted utility function with ~55 tunable scalars, refined by evolutionary search over millions of simulated games, with belief-propagation-style team inference layered on top.

### What's inside

**1. Tunable scoring function**
Every play is scored as expected team-captured-points minus the spend cost of the card, plus situational bonuses (smear toward known ally, penalty for feeding the enemy, special handling for the Queen of Spades, void-creation rewards for shedding a near-empty suit). ~55 scalar weights expose every magic number to optimization.

**2. Evolutionary tuning**
A (1+λ)-Evolution Strategy with self-adaptive sigma (1/5-success rule). Each generation samples 12 weight-vector mutations relative to the current best, evaluates them on 80–150 simulated games each, and promotes the strongest. Mirror-replay paired evaluation (every random seed is played twice with the personalities swapped) cancels out seat and shuffle variance.

**3. Multi-opponent fitness**
Fitness isn't just "beat the rule-based AI" — that opponent-overfits. The tuner runs each candidate against a *mix* of the locked baseline and the previous generation's tuned weights, so improvements have to generalize. A promotion gate blocks any candidate that regresses against the prior generation.

**4. Bayesian-style team inference**
Black Queen's defining feature is hidden partnerships. The strongest utility-function AI maintains a per-player probability of "is on the caller's team", updated from observed play patterns: a player who voluntarily feeds a high-point card to a trick they aren't winning is signaling whose side they're on. A threshold-gate promotes high-confidence inferences to "treat as confirmed ally / enemy."

**5. Generation pipeline**
Three selectable AI personalities live in production: **Hard** (locked rule-based baseline), **Hard-2** (first evolutionary refinement), **Hard-3** (added alliance inference + void-creation, re-tuned over 100 generations). Each generation's weights are archived as a versioned JSON and loaded into a distinct runtime slot.

## Generation 4: Information-Set MCTS

A different paradigm. Hard-3 represents the ceiling of "tunable utility function" — every recent tuning attempt landed within noise. Hard-4 changes the representation and the algorithm:

**1. Belief state**
For each unplayed card, maintain a multiset count of remaining copies (1 or 2 in the 65-card deck). For each opponent, maintain a set of cards they provably cannot hold, derived from observed play: suit voids (off-suit when you couldn't follow), played cards (now gone), the declared partner card (caller can't hold all copies). Hard constraints only in the shipped version; soft signals (bid-strength priors, smear/withhold inference) are gated off pending calibration.

**2. Information-Set Monte Carlo Tree Search**
For each move decision: (a) sample a determinization from the belief state — a complete assignment of unseen cards to opponent hands consistent with all known constraints; (b) from the root, pick a candidate move via UCB1; (c) play that move and roll out to game completion using a team-aware tactical policy; (d) backpropagate the team's captured-points share. Repeat for a time-budget worth of iterations (300ms in browser by default, configurable). Most-visited root action wins.

**3. Team-aware everything**
The rollout policy uses full information inside each determinization, identifies caller-team via the partner card, and plays accordingly: smear high-point cards onto ally-won tricks, defend Q♠, win cheaply when points are on the table, don't dump points onto enemy tricks. The ISMCTS value backprop sums the AI's *whole team's* captured points, not just self's pile — getting this right was a structural fix in Session 1.6.

**4. Opponent-intent Bayesian inference (Session 2)**
For each opponent not yet known-team, maintain a log-likelihood ratio for "is on caller team" vs "is opposing team". Update from observed plays scaled by *voluntariness* — the player had a meaningful alternative that would have signaled the opposite team allegiance. Eight calibrated signals: voluntary point-feed (+ per 5pts), voluntary Q♠ feed (special bonus, strongest signal), voluntary withhold, voluntary trumping of caller- or opposing-winning trick, voluntary low-card steal of points. Posteriors bias the determinization sampler toward configurations where the partner card lives in a likely-ally hand. **This was the lever that pushed Hard-4 decisively past Hard-3.**

**5. Rust → WASM deployment**
The engine, belief tracker, intent tracker, and search are written in Rust (4-crate workspace) and compiled to WASM. The browser loads a ~190KB `.wasm` artifact and runs Hard-4 entirely client-side. A parallel `--target nodejs` build powers headless arena tests. Native CLI throughput: 60k+ random games/sec. WASM per-move latency: ~300ms.

**6. Why a different paradigm**
Hard-3's utility function plays myopically — one ply at a time, scoring the current move only. Hard-4 plays with multi-ply look-ahead through search; every decision considers hundreds of imagined futures and picks the move that wins the most of them. The two paradigms have different strengths: Hard-3 wins on tightly-tuned scalar calibration; Hard-4 wins on planning, uncertainty handling, and continuous probabilistic intent inference (which a utility function structurally can't express well).

## Current strength

Verified by mirror-replay paired evaluation (each seed played twice, personalities swapped, variance cancels):

| Matchup | Hard-4 edge | Sample size |
|---|---|---|
| Hard-4 vs Hard-3 | **+3.92pp** (~4σ) | 500 mirror pairs |
| Hard-4 vs Hard-2 | **+3.80pp** | 300 mirror pairs |
| Hard-4 vs Hard   | **+5.32pp** | 500 mirror pairs |
| Hard-4 vs Normal | **+7.20pp** | 200 mirror pairs |
| Hard-3 vs Hard-2 | ~0pp | (reference) |
| Hard-3 vs Hard | +4.5–6pp | (reference) |
| Hard-3 vs Normal | +15.7pp | (reference) |

Hard-4 is now the strongest AI, beating every prior generation. The intent tracker is the decisive lever — without it (intent OFF), Hard-4 vs Hard-3 is approximately tied. With it, Hard-4 wins by +3.92pp at high statistical significance.

## What didn't work (across all generations)

- **Single-opponent ES tuning** opponent-overfits — candidates beat Hard on training seeds but lose to prior tuned gens. Switched to multi-opponent fitness with non-regression gate.
- **Soft probability scaling of smear/feed signals** (treating ally-probability as a gradient) regressed Hard-2 by ~1pp because weights were calibrated for binary gates. Reverted to threshold-gate integration.
- **Belief propagation across unknowns** (multi-hop inference) moved the needle by ~0.06pp — kept in codebase, off by default.
- **Hard-4 minimax endgame solver** regressed by ~1pp in A/B testing. Reason: minimax assumes adversarially-optimal opponents, but Hard-3 (the test opponent) plays heuristically. Solver picks moves good vs perfect play but suboptimal vs the actual opponent. Kept in codebase; future fix would be ISMCTS-in-endgame matching opponent model.
- **Hard-4 soft bid-strength belief prior** regressed by ~3pp at default weights. Bias direction was uncalibrated. Kept in codebase; needs ES tuning to find the right strength.

## How it was measured

Four harnesses, all reproducible from the CLI:
- **Arena** (`src/game/arena.ts`) — N-game benchmark across personality mixes; ~3,500 games/sec throughput.
- **Mirror arena** (`src/game/_mirror_arena.ts`) — paired-seed mirror replay; cuts variance significantly, makes small edges measurable.
- **Tournament** (`src/game/_tournament.ts`) — head-to-head matrix across every AI generation plus baselines.
- **A/B feature gates** (`src/game/_ab_*.ts`) — same-seed before/after comparison for any single feature, so behavior changes are isolated from variance.

End-to-end: every architectural change is gated by an A/B test before tuning, and every tuned candidate is validated against the full tournament on fresh seeds before shipping.

---

Total tuning compute (Hard-2/Hard-3): ~150k–200k simulated games per generation, all on a laptop CPU under seeded RNG.
Hard-4 inference: ~300ms per move at 300–1000 ISMCTS iterations; native arena throughput ~3 games/sec.
