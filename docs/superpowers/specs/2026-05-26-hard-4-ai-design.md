# Hard-4 AI — Design Spec

**Date:** 2026-05-26
**Status:** Approved (architecture), pending implementation plan
**Author:** Claude (collaborating with Timothy)

## Motivation

Hard-3 is the current ceiling of the "hand-crafted utility function + tuned scalars" representation. Head-to-head with Hard-2 sits at ~0pp; the last three improvement attempts (soft probability scaling, multi-hop inference propagation, broader tuning) all landed within noise. The next meaningful gain requires an **architectural change**, not more weight twiddling — already flagged in `src/components/AIInfoModal.tsx:281` and `CLAUDE.md`.

Hard-4 is that architectural change: a search-based AI built on a real belief representation, deployed via Rust→WASM in the browser. Hard-3 and prior generations remain frozen and selectable; Hard-4 is additive.

## Goals

- **New playable personality `hard-4`** in the lobby alongside Hard / Hard-2 / Hard-3.
- **Plays via search over a belief state**, not a one-ply utility function.
- **Runs entirely in the browser** via a Rust-compiled WASM module. The static-site / no-backend / no-API promise is preserved.
- **Per-move latency budget ≤ 400ms** on a typical laptop. Tunable; budget bounds search depth.
- **Same Rust codebase compiles to a native CLI** (`bq-cli`) for offline tournaments and tuning.

## Non-goals

- Do not modify Hard, Hard-2, Hard-3, or `DEFAULT_HARD_WEIGHTS`. Frozen exhibits.
- Do not train a neural network. Hard-4 is search + belief, not learning. (Distillation to a tiny net is a future Hard-5; out of scope here.)
- Do not add a backend or API.
- Do not redesign UI beyond a new lobby dropdown entry and AI Info modal section.

## Information audit — what Hard-4 must perceive that Hard-3 doesn't

Hard-3 tracks **one bit per player** ("on caller's team?"). Hard-4 tracks the full distribution.

**Hard constraints (must propagate, free wins, no tuning):**
- Suit voids — when a player doesn't follow suit, `P(any card of that suit ∈ hand(p)) = 0`.
- Played cards — `P(c ∈ hand(p)) = 0` for all `p` after `c` is played.
- Declared partner card — `P(partner_card ∈ hand(caller)) = 0`.
- Hand size — Σ probabilities per player = remaining hand size.

**Soft signals (Bayesian bumps, tunable):**
- Bid level → hand strength prior (high bidder more likely to hold aces, Q♠, long suits).
- Smear inference (Hard-3 already has this; ported and extended).
- Withhold detection (new — "could have fed an ally but didn't" as anti-ally evidence).
- Partner-card declaration → caller likely holds other strong cards in that suit.

**Algorithmic gaps Hard-3 has (subsumed for free by search):**
- Lead choice (currently rule-based, not unified with `scoreMove`) → ISMCTS picks leads.
- Multi-ply look-ahead (Hard-3 is purely myopic) → ISMCTS plays to end-of-game.
- Endgame (last 3 tricks small enough to enumerate) → exact solver when ≤3 tricks remain.
- Declare-phase reasoning → ISMCTS over candidate (trump, partner) declares.
- Bid-phase reasoning → belief-aware capacity estimate.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Browser (existing app, unchanged except for dispatch)    │
│                                                           │
│   ai.ts ──hard-4──► hard4Driver.ts                       │
│                         │ JSON state                      │
│                         ▼                                 │
│                    Web Worker                             │
│                         │                                 │
│                         ▼                                 │
│                    ┌────────────┐                         │
│                    │ WASM module│                         │
│                    │ bq-engine  │ ← pure rules port       │
│                    │ bq-ai      │ ← belief + ISMCTS       │
│                    └────────────┘                         │
│                         │ chosen action JSON              │
│                         ▼                                 │
│                    hard4Driver.ts                         │
│                         │                                 │
│                         ▼                                 │
│                    App game loop                          │
└──────────────────────────────────────────────────────────┘
```

**Rust workspace layout (new `rust/` directory at repo root):**

```
rust/
  Cargo.toml                  # workspace
  crates/
    bq-engine/                # pure reducer port of src/game/{engine,rules,deck,types}.ts
    bq-ai/                    # belief tracker + ISMCTS + declare/bid logic
    bq-wasm/                  # wasm-bindgen wrapper, JSON in/out
    bq-cli/                   # native binary: arena, tournament, tuning
```

**TypeScript additions (no removals):**

- `src/game/hard4Driver.ts` — loads WASM in Web Worker, serializes state, dispatches to WASM, deserializes move.
- `src/game/ai.ts` — adds `hard-4` case to dispatcher.
- `src/game/types.ts` — extends `AIPersonality` union with `"hard-4"`.
- `src/components/Lobby.tsx` — adds Hard-4 dropdown option.
- `src/components/AIInfoModal.tsx` — adds Hard-4 section.
- `main.tsx` — loads WASM module at startup.

**TypeScript codebase otherwise untouched.** Existing engine, AI personalities, components remain identical.

## Belief tracker (`bq-ai::belief`)

State: For each unplayed card `c` and each player `p`, maintain `P(c ∈ hand(p))` ∈ [0, 1].

**Initialization:** Uniform over remaining cards, subject to hand-size constraint (each player gets 13).

**Hard constraint updates** (zero/one assignments, no tuning):
- On non-follow: zero out all cards of that suit for that player.
- On play: zero out for all other players (the card is gone).
- On declare: zero out partner card for caller.
- After any update: re-normalize per player so Σ_c P(c, p) = remaining_hand_size(p).

**Soft signal updates** (additive bumps, tunable scalars):
- `bidStrengthFactor` — scale how much a high bid bumps priors on aces/Q♠/length.
- `smearStrengthFactor` — inherits from Hard-3's `inferSmearStrength`.
- `withholdStrengthFactor` — new; symmetric inverse of smear.
- `partnerSuitPriorBump` — small prior bump for caller holding strong cards in partner-card suit.

**Determinization sampling:** When ISMCTS needs to generate possible worlds, sample a complete assignment of unseen cards to opponent hands satisfying all hard constraints. Algorithm: constraint-propagation sampler with belief-weighted proposal, rejection if no valid completion (rare with hard constraints loose enough). Target: 200–500 valid samples per move.

## ISMCTS (`bq-ai::search`)

Information-Set Monte Carlo Tree Search. Standard algorithm with one adaptation: nodes index by **information set** (what the AI knows) rather than full game state.

**Loop per move:**
1. Sample a determinization from belief tracker.
2. Descend tree via UCB1 over actions legal in this determinization.
3. Expand a new node when reaching a leaf.
4. Rollout to end of game using a fast policy (Hard-3's `scoreMove` as the rollout policy — cheap and decent).
5. Backprop visit counts and value (calling team's captured-points share).
6. Repeat until time budget exhausted.
7. Select most-visited root action.

**Time budget:** Default 350ms (50ms slack under the 400ms latency budget for serialize/deserialize). Tunable via constructor.

**Endgame handoff:** When ≤3 tricks remain (≤15 unplayed cards total), switch from ISMCTS rollouts to **exhaustive enumeration** over all determinizations consistent with belief. Cheap and exact.

**Tunable search scalars** (~5–8):
- UCB exploration constant.
- Rollout policy temperature.
- Determinizations per second target (drives sample count).
- Endgame switchover threshold.
- Value: pure captured-points vs. team-bid-success blend ratio.

## Declare and bid phases

**Bid phase:** ISMCTS evaluates current hand strength against belief-sampled opponent hands. Output: expected captured points if I become caller at each bid level. Bid up while expected captures ≥ bid + safety margin. Falls back to Hard-3's bid logic if search budget exceeded.

**Declare phase:** For each candidate (trump suit, partner card) pair (small finite set), run short ISMCTS evaluation. Pick highest expected-value declare. Falls back to Hard-3's declare scoring if budget exceeded.

## WASM packaging

- Compile `bq-wasm` with `wasm-pack build --target web --release`.
- Output: ~200–500KB `.wasm` + small `.js` glue. Bundled into Vite build via standard import.
- Loaded once at app startup; instantiated inside a Web Worker created by `hard4Driver.ts`.
- Worker keeps WASM warm across moves within a session.

## Native CLI (`bq-cli`)

Native binary, reuses `bq-engine` + `bq-ai`. Subcommands:
- `arena N PERSONALITIES...` — equivalent of `src/game/arena.ts` but ~30–100× faster.
- `tournament N` — head-to-head matrix across personalities.
- `tune GENS LAMBDA GAMES` — ES tuning over belief + search scalars. Checkpoints every generation to disk; resumable.
- `smoketest` — asserts no illegal plays.

Existing TS CLI tools (`arena.ts`, `tune2.ts`, `_tournament.ts`) remain for cross-validation.

## Cross-validation

The Rust engine is a second implementation of the same rules. We exploit this:
- `bq-cli verify N` — plays N games using TS engine and Rust engine on identical seeds, asserts identical trick winners and final scores. Run as part of CI / smoke before any tuning.
- Any divergence is a bug in one engine; the test pinpoints which.

## Measurement & ship criteria

Hard-4 ships when:
1. **Smoketest** (Rust CLI) — 100% legal plays over ≥10k games.
2. **Cross-validation** — Rust engine matches TS engine bit-exactly over ≥1k games.
3. **Tournament** — Hard-4 vs Hard-3 over ≥5000 fresh-seed games shows positive edge with confidence interval excluding zero. Target: ≥+3pp; minimum ship: ≥+1pp.
4. **Mirror parity** — same with mirrored-replay paired evaluation (reduces variance).
5. **Hand check** — five gameplay sessions with a strong human observer reports qualitative improvement (not strictly required to ship, but logged).

## Phasing & 4-hour MVP scope (Plan C)

**Session 1 (4 hours, today):**
- Phase 1 — Rust workspace scaffolding + `bq-engine` port.
- Phase 2 — Belief tracker with **hard constraints only** (no soft signals).
- Phase 3 — Basic ISMCTS for play phase only (declare/bid delegate to Hard-3 logic).
- Phase 4 — `bq-wasm` build, `hard4Driver.ts`, Web Worker, lobby integration.
- Phase 5 — Smoke test in browser; one quick `bq-cli arena` run vs Hard-3 (~1000 games).
- Phase 6 (if time) — Kick off `bq-cli tune` overnight on default scalars.

**Out of scope for Session 1:**
- Soft-signal belief updates (bid prior, withhold, partner-suit bump).
- Search over declare/bid phases (Hard-3 logic delegated).
- Endgame exhaustive solver.
- AI Info modal section for Hard-4.
- Polished tournament + ship gate.

**Session 1 success criterion:** Hard-4 is selectable in the lobby, plays full games legally in the browser at ≤500ms/move, and the arena run produces an early signal on direction (positive, neutral, or negative).

**Future sessions:**
- Iteration loop: tuning runs → tournament → diagnose → adjust. Wall-clock-bound, multi-night.
- Add soft signals, declare/bid search, endgame solver as separable A/B-tested features (existing `_ab_*.ts` pattern, mirrored in Rust).
- Polish: AI Info modal section, latency tuning, optional "ponder during human turn" toggle (off by default).

## Risks

- **Belief tracker doesn't translate to wins** — most likely failure mode. Mitigation: ship Session 1 untuned, get signal early, plan iteration sessions explicitly.
- **WASM toolchain pain** — wasm-pack + Vite integration edge cases. Mitigation: budget +1h slack in Session 1; have a TS-prototype fallback if Rust path stalls.
- **Determinization sampler edge cases** — over-tight constraints may yield no valid samples. Mitigation: relax soft constraints first, never hard; instrument sampler with a "no valid sample" counter.
- **Per-move latency exceeded** — search budget too generous. Mitigation: budget is a runtime parameter; easy to dial down.
- **Maintenance burden of two engine implementations** — accepted because Black Queen rules are frozen; cross-validation test guards drift.

## Files touched

**New:**
- `rust/` (entire workspace)
- `src/game/hard4Driver.ts`
- `src/game/hard4-wasm/` (built WASM artifacts, gitignored or committed depending on size)
- `docs/superpowers/specs/2026-05-26-hard-4-ai-design.md` (this file)

**Modified:**
- `src/game/ai.ts` (add `hard-4` dispatch)
- `src/game/types.ts` (extend `AIPersonality`)
- `src/components/Lobby.tsx` (add option)
- `main.tsx` (load WASM)
- `vite.config.ts` (WASM plugin if needed)
- `CLAUDE.md` / `AGENTS.md` (document Hard-4)
- `package.json` (add WASM build script)
- `.gitignore` (Rust target/, WASM build artifacts as appropriate)

**Untouched (frozen):**
- `src/game/engine.ts`, `rules.ts`, `deck.ts` — game-driving TS engine, unchanged.
- `src/game/aiHard.ts`, `DEFAULT_HARD_WEIGHTS`, `tuned_weights_gen{2,3}.json` — Hard / Hard-2 / Hard-3 frozen.
- All UI components except `Lobby.tsx` and (later) `AIInfoModal.tsx`.
