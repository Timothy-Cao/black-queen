# Hard-5 plan, grounded in the trick-taking AI literature

**Created:** 2026-05-27. Companion to `hard5_roadmap.md` (which mapped the local optimum) and `tree_ismcts_plan.md`.

This synthesizes published work on AIs for structurally-similar games (Skat, Bridge, Dou Dizhu) into a concrete, architecture-compatible path to a true +2pp Hard-5.

---

## Why our session results match the theory

Hard-4 is a **PIMC-family** AI (Perfect-Information Monte Carlo: determinize hidden cards → evaluate → aggregate). Two of our findings are textbook predictions:

1. **Tree-ISMCTS and minimax endgame don't help / regress.** Frank & Basin (1998), *"Search in Games with Incomplete Information: A Case Study Using Bridge Card Play"*, prove PIMC suffers **strategy fusion** (the search assumes it can play differently in worlds it can't actually distinguish) and **non-locality**. Deeper determinized search runs into these — exactly what we measured. More search of determinized worlds has a fundamental ceiling.

2. **Heuristic injection hurts** (our PUCT / tactical-rollout / bid-prior nulls). The field's response to this was to move from hand-coded evaluation/rollout to **trained** components (DouZero, Suphx, Kermit). Trained evaluators are fit to outcomes, so they don't carry the systematic bias of hand-specified heuristics.

The literature's verdict: to beat well-tuned PIMC, you either (a) make the **inference** much better, (b) replace the **evaluator** with a learned one, or (c) use **sound search** (αμ) that fixes strategy fusion. Ranked by EV-per-effort for our stack, below.

---

## The three proven levers (mapped to Hard-4)

### Lever A — Learned card-location inference  ★ highest EV, lowest risk, best precedent

**Source:** Rebstock, Solinas, Buro, Sturtevant, *"Policy Based Inference in Trick-Taking Card Games"* (IEEE CoG 2019), and the Kermit Skat system. arXiv:1905.10911.

**What they did:** trained a deep net to predict **where hidden cards are**, conditioned on the observable move history, then used those predictions to **sample more realistic determinizations** inside an otherwise-unchanged PIMC search. Reported a **substantial cardplay-strength increase** for the state-of-the-art Skat bot — inference quality, not search depth, was the lever.

**Why it's the best fit for us:**
- Hard-4's decisive Hard-3→Hard-4 jump (+3.92pp) was *intent inference* — a hand-rolled version of exactly this. The literature says the learned version is markedly stronger.
- It's an **addition to the existing architecture**: we already have `BeliefState` with a `soft_prior` consumed by `sample_determinization`. We just replace the hand-coded soft prior with a learned `P(card c ∈ hand of player p | observable features)`.
- Hard constraints (`cannot_hold`) stay absolute; the net only sets soft weights. No risk of illegal sampling.
- **Inference is small and WASM-cheap.** A modest MLP's weights export to JSON (we already load tuned-weight JSONs at startup) and run as a few matmuls in Rust — no ONNX/heavy runtime needed.

**Build:**
1. **Data generation** (native engine, ~5000 games/s): play self-play games (hard-4 vs hard-4 or mixed), log per-decision `(observable features, true hidden-card locations)`. Millions of samples in minutes.
2. **Feature design:** bids made, cards played by each seat, voids revealed (who failed to follow which suit), trump, partner card, current trick. These are all already computed for intent inference.
3. **Train** (offline PyTorch) a per-card or per-(card,player) location predictor. Target: probability each unseen card is at each legal seat. Cross-entropy against the true location.
4. **Export** weights to JSON; implement forward pass in Rust (`belief.rs`), replacing/augmenting `apply_intent_prior`.
5. **A/B** vs current intent-prior inference, paired-seed, N≥5000, gate Z>2 & +1pp. Stack on greedy rollout.

**Expected:** this is the single most evidence-backed path. Skat saw large gains; inference was already our decisive lever.

### Lever B — Learned leaf value (Deep Monte Carlo, DouZero-style)  ★ higher ceiling, bigger build

**Source:** Zha et al., *"DouZero: Mastering DouDizhu with Self-Play Deep RL"* (ICML 2021), arXiv:2106.06135; GitHub kwai/DouZero. Also Suphx (Mahjong).

**What they did:** **Deep Monte Carlo** — no tree search. A network `Q(state, action)` is trained on sampled self-play returns; play = pick argmax Q over legal actions. Key trick: **encode actions as card-matrices** so the net generalizes over a huge action space; LSTM over move history; many parallel self-play actors. Beat all prior Dou Dizhu bots in days on 4 GPUs. Dou Dizhu's landlord-vs-2-cooperating-peasants is close to our hidden-coalition structure.

**Why relevant:** directly attacks our bottleneck (the heuristic rollout). A trained value gives a strong leaf estimate in **one forward pass** instead of a full noisy rollout — higher quality per iteration AND avoids the heuristic-bias trap. Could also make the tree viable (good leaf values rescue shallow trees).

**Cost:** real project — training pipeline, self-play infra, WASM inference of a bigger net. Weeks. Do only if Lever A is insufficient.

### Lever C — αμ sound search  ☆ principled but compute-heavy, low priority for us

**Source:** Cazenave & Ventos, *"The αμ Search Algorithm for the Game of Bridge"* (arXiv:1911.07960) and *"Optimizing αμ"*.

**What it does:** maintains **Pareto fronts of outcome vectors across worlds** instead of collapsing to a single per-world best move — directly fixing strategy fusion and non-locality. Beats PIMC in Bridge, at **higher compute cost**.

**Why low priority for us:** our binding constraint is the tiny iteration budget (240 iters at 80ms). αμ is *more* expensive than PIMC. It's the "right" search but the wrong fit until we have far more compute. Revisit only after a faster engine (below).

### Enabler — faster engine (orthogonal multiplier)

A bitboard/SIMD state representation for 5-10× more iterations/sec would: (1) directly add ~+2-3pp per the budget sweep's slope, (2) make tree-ISMCTS viable, (3) make αμ affordable. Substantial Rust perf work, but it multiplies the value of every other lever.

---

## Recommended sequence

1. **Land the endgame fix** (in flight) — free if it confirms.
2. **Lever A: learned inference.** Best EV/effort, architecture-compatible, JSON-weight deploy fits our existing pattern. This is the real Hard-5 attempt. Gate at N≥5000, Z>2, +2pp to claim the generation.
3. If A lands but isn't enough, **Lever B: DeepMC value** to replace the rollout.
4. **Faster engine** whenever we want to unlock tree-ISMCTS / αμ.
5. **αμ** last, once compute allows.

## Why this avoids repeating this session's dead ends
- Levers A and B are **learned**, not hand-coded → sidestep the proven "heuristic injection hurts" failure mode.
- We stop trying to extract more from determinized *search* (Frank & Basin say there's a ceiling) and instead improve *inference* and *evaluation* — the levers that actually moved Skat and Dou Dizhu.

---

## Lever A — Phase 1 DONE: signal confirmed (2026-05-27)

Built `_infer_datagen.ts` (logs observable features + ground-truth partner-card
location from hard-3 self-play) and `_infer_train.ts` (logistic-regression signal
check). 8000 games → 281k labeled rows in 7s — data generation is trivially fast.

**Held-out results (logistic regression, a LINEAR model):**

| model | AUC | log-loss | accuracy |
|---|---:|---:|---:|
| base rate | 0.500 | 0.597 | 71.5% |
| LR, all features | **0.865** | 0.396 | 79.5% |
| LR, void features removed (residual soft signal) | **0.843** | 0.425 | 78.5% |

**Conclusions:**
1. **Strong predictive signal exists** — AUC 0.865 from a linear model; an MLP will do better.
2. **The signal is mostly SOFT** (AUC 0.843 even after removing void hard-constraints already enforced by the sampler) → a learned soft prior is a real improvement over the current uniform/narrow prior.
3. **Bidding is highly predictive and currently UNUSED.** Top features include `targetPassed` (+0.73) and `targetWonBid`/`targetIsCaller` (−0.73) — the play-based `IntentTracker` ignores bidding entirely, so the learned model sees information the current system cannot. Strong reason to expect it beats the hand-rolled inference.
4. Other top features (`targetPointsPlayed` +1.13) match what IntentTracker's LLR already captures — validates the data.

**This de-risks Lever A.** Remaining Phase 2 steps:
- (a) Train a small MLP (TS or PyTorch), confirm AUC > LR, extend label from "partner card" to all unseen card-types (full soft prior).
- (b) Export weights to JSON (matches existing tuned-weight loading pattern).
- (c) Forward pass in `belief.rs`, replace/augment `apply_intent_prior`'s soft prior; keep `cannot_hold` hard constraints absolute.
- (d) A/B vs current inference, paired-seed, N≥5000; gate Z>2, +2pp to claim Hard-5.

Risk now low: signal is proven, data is cheap, deploy path (JSON weights + Rust matmul) is known. The main work is the Rust forward-pass + the proper multi-card model.

## References
- Frank & Basin (1998), *Search in Games with Incomplete Information: A Case Study Using Bridge Card Play* — PIMC pathologies (strategy fusion, non-locality).
- Cowling, Powley, Whitehouse (2012), *Information Set Monte Carlo Tree Search* — Hard-4's algorithm.
- Buro, Long, Furtak, Sturtevant (2009), *Improving State Evaluation, Inference, and Search in Trick-Based Card Games* (IJCAI) — Skat.
- Rebstock, Solinas, Buro, Sturtevant (2019), *Policy Based Inference in Trick-Taking Card Games* (IEEE CoG); arXiv:1905.10911 — **Lever A**.
- Zha et al. (2021), *DouZero* (ICML); arXiv:2106.06135 — **Lever B**.
- Cazenave & Ventos (2019/2021), *The αμ Search Algorithm for the Game of Bridge*; arXiv:1911.07960 — **Lever C**.
