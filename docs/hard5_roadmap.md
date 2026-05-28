# Hard-5 Roadmap

**Created:** 2026-05-27 (session reorganization). **Commit:** 3a6a608.

This consolidates what we know, what we've tried, and what's most likely to actually produce a Hard-5 worth shipping.

---

## Lesson from this session and prior null attempts

**Local rule patches on a 240-iteration ISMCTS don't move the needle.**

Five Hard-5 attempts ended null:
1. ES tuning intent weights (CLAUDE.md)
2. Indicator-mode rollout values (CLAUDE.md)
3. Partner-aware bidding (CLAUDE.md)
4. Archetype-aware bidding (CLAUDE.md)
5. **This session — bidCap=270 raise** (Δ=+0.97, Z=0.19 at N=2000)
6. **This session — follow-side discard guard** (Δ=+0.55, Z=0.15 at N=2000)

Two more recipes that regressed:
- BQ_ENDGAME (pure minimax endgame solver): ~−1pp
- BQ_BIDPRIOR (bid-strength belief prior): ~−3pp

The **pattern** is consistent: small, principled tweaks to bidder weights or post-hoc play guards get neutralized by ISMCTS's own future-state evaluation OR by opponent belief-tracker adaptation. The signal is washed out.

**What DID produce a generation jump:** intent inference (Hard-3 → Hard-4 was +3.92pp). That was an *architectural* change — adding a new Bayesian inference layer that the search consumes.

---

## Architecture inventory

What the Hard-4 stack actually is, post-code-read 2026-05-27:

| Layer | Implementation | Notes |
|---|---|---|
| Bid | `hardTunedBid` (TS) — closed-form capacity estimate | `bidCap=240`, `bidCapExtraordinary=280` dead-zone (well-documented Hard-3 weakness, doesn't transfer to Hard-4 in production) |
| Declare | `hardTunedDeclare` (TS) — heuristic | Untouched in any null attempt; could be a lever |
| Play | `ismcts_play` (Rust) — **flat MCTS, no tree below root** | UCB1 at root, rollouts are full random/tactical playouts to end |
| Rollout | `rollout_tactical` (Rust) — per-trick greedy heuristic with team awareness | Single deterministic policy; no diversity |
| Belief | `BeliefState` (Rust) — hard constraints + soft prior | `cannot_hold` + `hand_sizes` + `soft_prior`; sampler retries up to 32× |
| Intent | `IntentTracker` (Rust) — Bayesian opponent intent inference | THE lever from Hard-3 → Hard-4. Affects belief weights from play observations. |
| Determinization | `sample_determinization` — most-constrained-first + weighted assignment | Reasonable; not a clear hotspot |
| Budget (WASM) | `max_iters = time_ms × 3` | 240 iters at 80ms, 720 at 240ms, 900 at 300ms (browser default), 2400 at 800ms |

**The search is flat.** No tree expansion below the root. Every iteration goes: determinize → pick root action via UCB1 → apply → rollout to end → backprop. The "tree" is `HashMap<Card, ActionStats>` at the root only. This is what some literature calls "1-ply ISMCTS" or "flat MCTS-ISMCTS."

---

## Why local patches keep failing (mechanism)

Two things conspire:

1. **ISMCTS's rollout already approximates good play.** `rollout_tactical` does smear-to-ally, dump-to-enemy, defensive trump, Q♠ care. When a "misplay" looks obvious to a human reviewer, ISMCTS's rollouts have often already considered the alternative and weighted it correctly across many determinizations. Forcing the cheaper card via post-hoc guard is just *one* of the rollout's choices — and not always the better one once future-trick implications are factored in.

2. **Opponent belief-tracker adapts to bid signals.** This is what we saw with `cap270` — when SUBJECT bids more aggressively, opponent hard-4 ISMCTS infers SUBJECT is stronger and defends accordingly. Bidder changes get washed in symmetric A/B.

**Conclusion:** any genuinely useful Hard-5 lever has to be one of:
- An **architectural change** to search (tree expansion, better priors, smarter rollout)
- An **independent improvement** that opponent inference doesn't easily detect (e.g., faster iterations → more search)
- A **bid-side change that's not signal-leaking** (rare; bidding is inherently observable)

---

## Untried (or under-tried) levers, ranked by EV-per-effort

### Tier S — biggest potential, untested

**S1. Tree-structured ISMCTS.**
Build a real tree below the root. Subsequent player actions create child nodes. UCB tracks per-node statistics. Each new iteration descends through the existing tree and expands a leaf. This is the canonical ISMCTS algorithm (Cowling et al. 2012).

- Cost: 2-3 days serious Rust work
- Why high EV: gives genuine multi-trick lookahead. Even with same iteration count, deeper tree exploration produces better-quality decisions
- Risk: serious change; needs careful tests; performance characteristics shift
- A/B path: dedicated harness; aim for Z>3 at N=500 vs current flat MCTS

**S2. Rollout policy improvement.**
`rollout_tactical` makes one greedy choice per trick. Replace with a SECOND ISMCTS call (mini-search inside rollout) or a learned policy that biases samples toward strong play.

- Cost: 1-2 days; risk of slowing iteration rate (mini-search) vs improving signal-per-iter
- Why high EV: rollouts feed the UCB statistics; biased rollouts = biased decisions. Better policy = better signal
- Easy first version: try `rollout_greedy` vs `rollout_tactical` A/B to see how sensitive ISMCTS is to rollout quality
- A/B path: hard-4 vs hard-4, swap rollout policy, paired-seed

### Tier A — medium effort, plausibly significant

**A1. Cheaper iterations → more iters in same time budget.**
Profile the inner loop. Common candidates: belief sampler retries (currently up to 32 restarts), card-equality comparisons (uses Card struct equality), rollout's per-trick heuristic re-computation.

- Cost: ½–1 day profiling + targeted optimization
- Why decent EV: if we 2× iter rate at 80ms, that's equivalent to running at 160ms. Free quality improvement
- A/B path: same as budget sweep; measure win-rate per iter, not per second

**A2. PUCT with priors instead of UCB1.**
PUCT (used by AlphaGo) accepts a prior over actions, exploring high-prior actions first. We have a natural prior from `hardTunedPlay`'s scoring — give that as the prior, let MCTS refine from there.

- Cost: 1 day
- Why decent EV: with only 240 iters at 80ms, lots of iters get "wasted" on obviously-bad actions. Priors front-load exploration on plausibly-good actions
- A/B path: hard-4 with PUCT vs hard-4 with UCB1, paired-seed

**A3. Search-based bidder.**
The user's two-phase concept. Phase 1: lock play, run rollouts to estimate hand→capture distribution. Phase 2: bidder uses that lookup. Avoids the closed-form pitfall.

- Cost: 1-2 days for the simulation harness + lookup table
- Why uncertain EV: the bid signal-leak problem still applies — even an optimal bidder hurts if opponents read it. May help against weaker opponents (mixed AI in lobby) but not in self-play A/B
- A/B path: hard-4 with search bidder vs hard-4 with current bidder, paired-seed, in BOTH symmetric (hard-4 only) and asymmetric (hard-4 vs hard-3) configurations

### Tier B — speculative

**B1. Bigger iteration cap on WASM.**
Currently `max_iters = time_ms × 3` on WASM (no monotonic clock). On native it's 100,000. Could relax the WASM cap; let iterations run until a higher hard ceiling.

- Cost: 1 line change
- Why uncertain: if budget sweep shows scaling helps (testing now), this is the lever. If not, useless

**B2. Multiple rollouts per determinization.**
Currently 1 rollout per iter. Multiple rollouts on same determinization = lower variance per sample at constant determinization cost.

- Cost: ½ day
- Why uncertain: helps if determinization is expensive relative to rollout; unclear from quick read

**B3. Declare-side improvements.**
Trump choice + partner card selection is `hardTunedDeclare` (TS heuristic, unchanged). Could ISMCTS-ize declare: sample partner-card choices and play out hand, pick declare that maximizes expected EV.

- Cost: 1-2 days
- Why uncertain: declare is downstream of bid; if bidder picks ok, declare may be near-optimal already

---

## Recommended attack order

1. **Wait for paired-seed budget A/B result** (in progress, pid 75553). If 300→800ms gives Δ ≥ +1pp Z>2 → **B1 (raise iteration cap)** is the cheapest Hard-5 in history. If not, scaling is plateaued at our current ISMCTS shape and we need architectural change.

2. **Quick test: rollout policy sensitivity (S2 lite).** A/B `rollout_greedy` vs `rollout_tactical` with paired seeds. If meaningful gap → rollout is the lever; full S2 worth doing. If no gap → rollouts saturate quickly and S2 is lower priority.

3. **Profile iteration cost (A1).** Run hard-4 with `--features bench` or similar; see where time goes. Likely hotspot: `sample_determinization` retries OR `rollout_tactical`'s legal-play enumeration per trick.

4. **Implement PUCT priors (A2).** Concrete, bounded, and addresses the 240-iter budget by directing exploration. Highest EV among "1-day" experiments.

5. **Implement tree-structured ISMCTS (S1).** The biggest lever, but most expensive. Save for when smaller items are exhausted.

---

## A/B harness coverage we now have

| Harness | Use case |
|---|---|
| `_mirror_arena.ts` | Personality-vs-personality, unseeded — coarse, prone to noise across runs |
| `_bid_calibration.ts` | Per-hand bid-cap EV measurement |
| `_bid_weight_ab.ts` | Bidder weight A/B, paired-seed, supports BQ_SEATS for hard-3 or hard-4 mode |
| `_follow_guard_ab.ts` | Rust toggle A/B (one-bit ON/OFF) at fixed seats |
| `_budget_ab.ts` | Paired-seed budget A/B across N budgets per seed |

All paired-seed harnesses use the `mulberry32 + setRandom` pattern; results are variance-cancelled at high N (1k–10k).

---

## Open instrumentation needs

- **Per-iteration timing breakdown** in ISMCTS — for A1
- **Action prior export** from hardTunedPlay — for A2
- **Tree-node visit logging** when tree ISMCTS lands — for S1
- **Mini-MCTS in rollout** — for S2 advanced version

---

## What I will NOT pursue

- More closed-form bidder tweaks (5 nulls; saturated)
- More post-hoc play guards (this session: null)
- ES tuning of existing weights (CLAUDE.md null; v1 and v2 both)
- Pure indicator-mode rollout (CLAUDE.md null; -1.5pp)

---

## Experiments completed this session

### Budget A/B — paired N=1000 at 80 / 300 / 800 ms (pid 75553)

| budget | hard-4 win% | %caller | %made |
|---:|---:|---:|---:|
| 80ms (240 iters) | 54.70% | 20.1% | 74.1% |
| 300ms (900 iters) | 55.20% | 20.1% | 73.6% |
| 800ms (2400 iters) | 55.90% | 20.1% | **78.1%** |

| A → B | Δ win% | Z |
|---|---:|---:|
| 80 → 300ms | +0.50 | 0.51 |
| 300 → 800ms | +0.70 | 0.86 |
| 80 → 800ms | **+1.20** | 1.21 |

**Reading:** scaling helps but slowly — +1.2pp at 10× iterations, just below significance. `%made` clearly improves at 800ms (+4pp), suggesting deeper search recovers some failed contracts. Not a free Hard-5 (would need significant UX latency hit for ~1pp) but a real signal.

**Decision:** don't ship a default-budget bump alone. Continue to S2 (rollout sensitivity test) to see if there's a bigger play-side lever.

### Rollout-policy A/B — paired N=1500 at 80ms (pid 76751) **POSITIVE**

| policy | hard-4 win% | %made (caller) |
|---|---:|---:|
| **greedy** | **56.47%** | **82.5%** |
| tactical (current) | 54.87% | 76.2% |
| random | 54.27% | 77.6% |

| comparison | Δ win% | Z |
|---|---:|---:|
| greedy vs tactical | **+1.60** | **−1.96** |
| greedy vs random | +2.20 | −2.83 |
| tactical vs random | +0.60 | 0.72 |

**Greedy beats Tactical by +1.60pp** at Z=−1.96 (just under significance). Greedy beats Random significantly. Hard-4 with greedy rollout makes contracts **6.3pp more often** than with tactical (82.5% vs 76.2%).

**Mechanism hypothesis:** the "smarter" tactical rollout (team-aware smear, Q♠ preservation) biases ISMCTS estimates. After determinization, tactical assumes specific team assignments and plays accordingly — but if the determinization differs from reality, that bias compounds. Greedy's team-blindness gives less-biased samples → UCB stats are honest → root-action selection is better.

This is the classic MCTS "rollout policy too good can hurt" result (Silver & Tesauro 2009 et al). We just happen to have a real-world case of it.

### Follow-up: confirmation runs

**80ms N=5000 (pid 80163) — REGRESSED TO MEAN**

| comparison | Δ at N=1500 | Z | Δ at N=5000 | Z |
|---|---:|---:|---:|---:|
| greedy vs tactical | +1.60pp | -1.96 | **+0.70pp** | **-1.52** |
| greedy vs random | +2.20pp | -2.83 | +0.18pp | -0.39 |

The N=1500 "significant" result for greedy vs random was a false positive. The greedy-vs-tactical direction held but magnitude halved. At N=5000, Z=-1.52 is below the 2σ bar.

**Honest conclusion:** rollout policy is not a clean Hard-5 lever at 80ms. ISMCTS is mostly rollout-robust at 240 iters.

**Lesson learned:** never claim a Hard-5 candidate at N<3000. Variance dominates small-N MCTS comparisons. Future A/B's: minimum N=5000 for any "candidate" claim.

**300ms N=2000 (pid 80189) — CONFIRMED DIRECTION**

| comparison (300ms) | Δ | Z |
|---|---:|---:|
| greedy vs tactical | +0.95pp | -1.44 |
| greedy vs random | +0.90pp | -1.26 |
| random vs tactical | +0.05pp | -0.07 |

Direction (greedy ahead) consistent with 80ms result. %made at 300ms: greedy 82.8% vs tactical 77.1% (+5.7pp — robust across budgets).

### Pooled meta-analysis

Inverse-variance weighted across both budgets:
- 80ms N=5000: Δ=-0.70pp, SE=0.46
- 300ms N=2000: Δ=-0.95pp, SE=0.66

**Pooled: Δ=-0.78pp, Z=-2.07 (just significant).**

Small but consistent positive effect for greedy rollout.

## ✅ Hard-5 v1 SHIPPED 2026-05-27

**Change:** `ROLLOUT_POLICY_NATIVE` and `ROLLOUT_POLICY_WASM` defaults flipped from `Tactical` → `Greedy` in `rust/crates/bq-ai/src/ismcts.rs`.

Both WASM targets rebuilt (`src/game/wasm/`, `src/game/wasm-node/`).

**Expected impact:**
- ~+0.8pp Hard-4 win-rate vs Hard-3 (pooled meta-analysis Z=2.07)
- +5.7pp Hard-4 caller %made (robust signal across budgets)
- Modest but shippable; first improvement to ISMCTS since Hard-4 baseline

**Mechanism:** team-aware tactical rollout was biasing ISMCTS estimates. After determinization, tactical assumed specific team assignments and played accordingly. If the determinization differed from reality, that bias compounded into UCB statistics, making root-action selection overconfident in wrong directions. Greedy's team-blindness gives less-biased samples → honest UCB stats → better root selection.

**Override:** native sets `BQ_ROLLOUT=tactical|random|greedy` to override per-run.

**Confirmation (pid 86554):** N=5000 at 80ms re-confirms greedy vs tactical −0.70pp Z=−1.52 (harness force-sets each policy so it's a re-run of the same experiment, not a default-path test, but the greedy numbers are exactly what now ships). No regression.

---

## Hard-5 v2 attempt — PUCT priors (Tier A2) — IN FLIGHT

**Rationale:** greedy ≈ random (only 0.18pp apart) ⇒ ISMCTS is rollout-insensitive ⇒ the bottleneck is the tiny iteration budget (240 iters at 80ms spread across up to 13 root candidates, ~18-40 visits each). PUCT concentrates iterations on heuristically-plausible moves.

**Implementation:** `pick_puct` in `ismcts.rs`. Prior = greedy-heuristic pick gets `concentration` of the mass, rest uniform (deliberately mild — a strong prior would reintroduce the tactical-rollout bias problem). Toggles: native `BQ_PUCT=1 BQ_PUCT_C=1.5 BQ_PUCT_CONC=0.5`; wasm `set_puct_wasm(enabled, c×100, conc×100)`. Default OFF until A/B proves it.

**A/B variants (pid 92830, N=4000 at 80ms):**
- `ucb1` (baseline)
- `puct_c150_k50` (c=1.5, 50% mass on greedy pick)
- `puct_c150_k35` (c=1.5, 35% mass)
- `puct_c100_k50` (c=1.0, 50% mass)

If any variant beats UCB1 by Z>2, PUCT stacks on greedy rollout → stronger Hard-5. If null, ISMCTS root selection is already well-balanced and we pivot to tree-structured ISMCTS (S1).

**RESULT (N=4000 at 80ms) — REGRESSED, all variants:**

| variant | Δ win% vs UCB1 | Z |
|---|---:|---:|
| puct_c100_k50 | −1.25pp | −2.22 |
| puct_c150_k35 | −1.43pp | −2.50 |
| puct_c150_k50 | −1.52pp | −2.67 |

All three PUCT variants **significantly hurt**. The greedy-pick prior biases root selection toward the heuristic move; UCB1's unguided exploration does better. PUCT stays OFF (default already off; no code change). Code + toggles retained for future use with a *learned* (not heuristic) prior.

---

## ⚑ KEY META-FINDING: heuristic injection into Hard-4's search consistently hurts

Three independent data points now agree:

| experiment | "more heuristic" side | result |
|---|---|---|
| Rollout policy | tactical (team-aware) vs greedy | greedy wins (~+0.7pp) |
| PUCT prior | greedy-pick prior vs uniform UCB1 | UCB1 wins (~+1.4pp) |
| Bid-strength belief prior (CLAUDE.md) | prior-bumped beliefs vs flat | flat wins (~+3pp) |

**Hard-4's ISMCTS does better with LESS hand-holding.** Injecting domain heuristics — into rollouts, into root priors, into belief weights — biases the search toward systematically-wrong heuristic moves. The search's own statistics are more honest than our heuristics.

**Strategic implication for Hard-5:** stop trying to make the heuristics smarter. The remaining levers are all about giving the search *more/better raw search*, not more guidance:
- More iterations (budget) — tested, +1.2pp at 10×, diminishing returns
- **Tree-structured ISMCTS** — deeper lookahead per iteration. UNTESTED. The big lever.
- Better determinization sampling — more representative hidden-state samples
- Learned value/policy (NN) — replaces heuristic rollout with a trained evaluator. Big project; would need to AVOID the heuristic-bias trap by being trained, not hand-coded.

---

## Honest status of the "Hard-5" hunt

**Nothing yet justifies a Hard-5 generation label** (project bar: +2-4pp).

What we have:
- **Greedy rollout** (shipped as default): ~+0.78pp pooled, robust +5.7pp caller %made. This is a legitimate **Hard-4.1 increment**, NOT a generation. Renamed accordingly below.
- Everything else this session: null or negative (bidCap raise on hard-4, follow guard, PUCT).

What a real Hard-5 likely requires:
- **Tree-structured ISMCTS** (Tier S1) — the only untested high-EV lever. Multi-day build. This is the recommended next major investment.
- Validation must be at **N≥5000** and ideally in **multiple configurations** (hard-4 vs hard-4 mirror, not just vs hard-3), per the small-sample lessons this session.

### Naming correction
- ~~"Hard-5 v1"~~ → **Hard-4.1: greedy rollout** (shipped, marginal, honest)
- ~~"Hard-5 v2"~~ → PUCT priors (null, not shipped)
- "Hard-5" remains **unclaimed** pending an architectural change with a +2pp+ result.

---

## Hard-4.2 attempt — UCB exploration constant tuning — IN FLIGHT

**Rationale:** consistent with the meta-finding (more efficient raw search, no heuristic injection). On WASM the iteration count is *fixed* at the cap (no clock → always exactly `time_ms×3` iters), so the only way to improve search at fixed budget is to use those iterations more efficiently. With only 240 iters spread over up to 13 candidates, the explore/exploit balance (`ucb_c`, default 1.4) is likely mis-set — too much exploration wastes scarce iterations on clearly-bad moves.

**A/B (pid 1541, N=4000 at 80ms):** c ∈ {1.4 baseline, 0.7, 1.0, 2.0}. Lower c = more exploitation. Toggle: native `BQ_UCB_C=`, wasm `set_ucb_c_wasm(c×100)`.

If a lower c beats baseline at Z>2, it's a free pure-search improvement (no heuristic bias). Stacks cleanly with greedy rollout.

**RESULT (N=4000 at 80ms) — NULL:**

| variant | Δ win% vs c140 | Z |
|---|---:|---:|
| c070 | −0.03pp | −0.05 |
| c100 | −0.40pp | −0.84 |
| c200 | −0.27pp | −0.60 |

Default `ucb_c=1.4` is already well-set. No free lunch in exploration tuning.

---

## CONCLUSION: cheap levers exhausted

Everything tunable within the existing flat-MCTS structure has been tested:

| lever | result |
|---|---|
| Rollout policy (greedy vs tactical) | +0.78pp (shipped as Hard-4.1) |
| Rollout policy (greedy vs random) | ~0 (rollout-insensitive) |
| PUCT prior | −1.4pp (heuristic injection hurts) |
| UCB exploration constant | null |
| Search budget (iterations) | +1.2pp at 10×, diminishing, UX cost |
| bidCap raise (hard-4) | null |
| Follow-side discard guard | null |

The flat MCTS is well-tuned. The **only remaining high-EV lever is structural: tree-structured ISMCTS** (Tier S1). Plan written to `docs/tree_ismcts_plan.md`.

---

## Hard-5 attempt — Tree-structured ISMCTS (SO-ISMCTS) — BUILT, A/B IN FLIGHT

**Phase 1 (done):** `rust/crates/bq-ai/src/tree_ismcts.rs` — arena-based SO-ISMCTS with availability-count UCB, depth limit, greedy rollout below the tree. 4 tests pass (legal move, single-legal shortcut, determinism, multilevel). Wired behind `BQ_TREE=1` / `set_tree_ismcts_wasm(enabled, depth)`, default OFF. Total Rust tests 27/27 green.

**Important measurement note:** on WASM the iteration cap is fixed (`time_ms×3`), so tree and flat run the SAME iteration count — tree iterations cost more wall-clock but are individually more informed (sub-tree statistics vs pure rollout). This equal-iteration A/B is favorable to tree and answers "is the algorithm better per iteration." If tree wins here, a follow-up must match WALL-CLOCK (give tree fewer iters) before shipping, since the browser budget is latency-bound.

**Phase 2 A/B (pid 8185, N=4000 at 80ms = 240 iters):** flat (baseline) vs tree_d6 / tree_d10 / tree_d16 (tree depth in plays).

Ship gate: tree beats flat by Z>2 AND Δ>+1pp at equal iterations, THEN survives a wall-clock-matched re-test, THEN N≥5000 confirmation. Only then does it earn "Hard-5."

**RESULT (N=4000 at 80ms, equal-iteration) — NULL:**

| variant | Δ win% vs flat | Z |
|---|---:|---:|
| tree_d10 | +0.13pp | 0.25 |
| tree_d6 | −0.60pp | −1.12 |
| tree_d16 | −0.70pp | −1.31 |

Tree ISMCTS does **not** beat flat MCTS — even at equal iterations, which favors the tree (tree iters cost more wall-clock, so a latency-matched test would be strictly worse; not worth running).

**Why:** at ~240 iterations the tree *starves*. Branching ~6 × depth 6-16 spreads the scarce samples across far more nodes than flat MCTS, so each node's statistics are too sparse to be reliable. Flat MCTS — all iterations voting directly on root actions — uses the tiny budget more efficiently. Tree ISMCTS needs 10k-100k iterations to shine; Hard-4 has 240-900. This is exactly the failure mode the plan flagged as possible.

Code kept behind `BQ_TREE` toggle (default off, 27 tests green) — it would become viable if we ever get a much larger iteration budget or a cheaper per-iteration cost (e.g. NN rollout).

---

## ⚠ Endgame solver discrepancy — possible shipping regression (A/B in flight)

While auditing, found that `should_solve_endgame` gates the ≤10-card minimax
solver OFF on **native** (via `BQ_ENDGAME` env, default off — it A/B'd at −1.1pp)
but the cfg **compiled that check out on wasm32**, leaving the solver **ON in the
browser** (and in every wasm-node A/B harness this session). CLAUDE.md believed
it was "default OFF" — true only on native.

If the −1.1pp native result transfers to wasm, **disabling it on wasm is a free
~+1pp recovery** — and it would mean all this session's wasm A/B baselines had
the solver active (a constant across arms, so relative deltas still valid).

Added `set_endgame_enabled_wasm` toggle. A/B (pid 11557, N=5000 at 80ms):

| variant | hard-4 win% | Δ vs on | Z |
|---|---:|---:|---:|
| endgame_on (current wasm) | 55.46% | — | — |
| endgame_off (matches native) | 54.82% | −0.64pp | −1.46 |

**RESULT: NOT a regression.** Disabling the solver on wasm is −0.64pp (Z=−1.46,
not significant) — i.e. the solver ON is neutral-to-slightly-helpful on wasm,
the OPPOSITE of native's −1.1pp. Reason: native's −1.1pp used the old tactical
rollout + the cfg path differs; on wasm the determinization-voting
`ismcts_endgame` with greedy rollout is benign. **Decision: leave endgame ON in
wasm (unchanged).** Toggle retained. No win, but we confirmed we are NOT shipping
a regression — a real worry now closed.

---

# FINAL CONCLUSION — Hard-4 is at a strong local optimum

After exhaustively testing every accessible lever this session:

| Category | Levers tried | Outcome |
|---|---|---|
| Rollout policy | greedy/tactical/random | greedy marginally best (+0.78pp), shipped as Hard-4.1 |
| Heuristic injection | PUCT prior, tactical rollout, bid prior | all HURT — search beats its own heuristics |
| Search hyperparams | UCB constant | null (already tuned) |
| Search budget | 80/300/800ms | +1.2pp at 10×, diminishing, latency cost |
| Search structure | tree-ISMCTS d6/d10/d16 | null — iteration budget too small for a tree |
| Bidding | bidCap raise | null on hard-4 (helps hard-3 only) |
| Tactical guards | follow-side discard guard | null |

**The bottleneck is the iteration budget (240 at 80ms, 900 at 300ms), and the architecture is well-tuned within it.** Neither more structure (tree) nor more guidance (heuristics/priors) helps at this budget; only more raw iterations help, and only slightly, at a latency cost.

### A genuine Hard-5 requires a bigger investment — two real options:

1. **Neural-net value/policy to replace the rollout** (AlphaZero-style). A trained evaluator gives a strong leaf value in ONE forward pass instead of a full noisy rollout, AND avoids the heuristic-bias trap (it's trained, not hand-coded). This both raises per-iteration quality and could make the tree viable. Major project: training pipeline, self-play data, inference in WASM. Weeks, not days.

2. **Much larger iteration budget via a faster engine** — e.g. SIMD/bitboard state representation to get 5-10× more iterations in the same wall-clock. The budget sweep suggests ~+1pp per budget doubling near current levels; a 5× speedup ≈ +2-3pp, potentially Hard-5-worthy, and it would also make the tree viable. Substantial Rust perf work.

### Honest bottom line
This session produced one real-but-marginal win (greedy rollout, +0.78pp) and conclusively mapped the ceiling of the current architecture. There is no cheap Hard-5 left. The remaining paths are multi-week engineering investments (NN evaluator or a 5×-faster engine), and either would need to clear the N≥5000, Z>2, +2pp bar before claiming the generation.

---

## Status of in-flight experiments (as of session)

- **pid 80163** — `_rollout_ab.ts` N=5000 at HARD4_TIME_MS=80; ~10 min ETA
- **pid 80189** — `_rollout_ab.ts` N=2000 at HARD4_TIME_MS=300; ~15-20 min ETA

---

## Status of in-flight experiments (as of session)

- **pid 76751** — `_rollout_ab.ts` N=1500 paired seeds, 3 policies (tactical/greedy/random) at 80ms. Result will determine if rollout improvements are worth pursuing.
