# Codex harness — Black Queen

A 5-player Black Queen card game. Local browser only (Vite + React + TS + Tailwind v3). No backend, no API calls.

This file is for Codex. It documents conventions, tooling, and the most common operations so any future session can pick up cold.

---

## Project layout

```
src/
  App.tsx                       # top-level state machine + AI driver
  main.tsx                      # boots app; loads tuned weight JSONs into AI slots
  index.css                     # global styles + .card-face / .card-back

  components/                   # all React UI
    Lobby.tsx                   # pre-game setup; AI personality dropdown
    PlayerSeat.tsx              # one of 5 seats; collection pile + popup
    CollectionDeck.tsx          # human's own collection pile (separate from PlayerSeat)
    HandStrip.tsx               # human's 13 cards along bottom
    TrickArea.tsx               # 5 played cards in the table center
    BiddingPanel.tsx            # human bid UI
    DeclarePanel.tsx            # human trump+partner pick UI
    RoundEnd.tsx                # game-complete modal (round review here)
    Sidebar.tsx                 # score panel
    SettingsBar.tsx             # gear menu
    CardView.tsx                # single card render (memoized, supports 4 skins)
    CardSkinContext.tsx         # skin enum + provider
    HelpModal.tsx               # rules
    HistoryModal.tsx            # log
    PartnerRevealFlash.tsx, TurnHint.tsx, TableCenter.tsx, Confetti.tsx, ScoreCell.tsx

  game/
    types.ts                    # all shared types incl. AIPersonality
    engine.ts                   # pure reducer (applyBid/applyPass/applyDeclare/applyPlay/collectTrick)
    rules.ts                    # legalPlays, trickWinner
    deck.ts                     # 65-card deck builder + light/full shuffle
    ai.ts                       # dispatcher: routes personality → impl
    aiHard.ts                   # rule-based + scored AI; HardWeights interface; gen2/gen3 slots
    sfx.ts                      # web-audio SFX (no external assets)

    tuned_weights_gen2.json     # imported by main.tsx → setGen2HardWeights
    tuned_weights_gen3.json     # imported by main.tsx → setActiveHardWeights

    # CLI-only simulation tools (excluded from tsc-build via tsconfig.app.json):
    arena.ts                    # headless N-game benchmark by personality mix
    tune.ts                     # (1+λ)-ES single-opponent tuner
    tune2.ts                    # (1+λ)-ES multi-opponent tuner (vs hard + v1)
    smoketest.ts                # asserts every AI play is legal
    _tournament.ts              # head-to-head matrix across gens + baselines
    _ab_void.ts                 # void-creation feature A/B harness
    _ab_infer.ts                # alliance-inference feature A/B harness
    _mirror_arena.ts            # paired-seed mirror replay (variance-canceling arena)
    _verify_personalities.ts    # confirms each AI personality routes correctly

    hard4Driver.ts              # TS bridge to Rust/WASM Hard-4 engine
    wasm/                       # wasm-pack --target web build (browser)
    wasm-node/                  # wasm-pack --target nodejs build (arena/CLI)

# Rust workspace (Hard-4 engine; native CLI + WASM target)
rust/
  crates/bq-engine/             # port of TS reducer (pure rules in Rust)
  crates/bq-ai/                 # belief tracker + ISMCTS + Hard-4 entry points
  crates/bq-wasm/               # wasm-bindgen JSON wrappers
  crates/bq-cli/                # native binary: smoke, arena (future)

# repo root
tuned_weights.json              # working copy = current latest gen (read by CLI tools)
tuned_weights_v1.json           # archive: gen-2 weights
tuned_weights_v2.json           # archive: gen-3 weights (= current latest)
```

---

## Game rules (terminology)

- **Game** = one full play sequence: bid → declare → 13 plays → score. Single-game model: no multi-round games.
- **Round** (UI terminology) = one of the 13 sub-plays. Each player plays exactly one card per round.
- **Trick** (internal terminology) = same concept as Round. Code uses `trick`; user-facing text says "round".
- **Caller** = the player who won the bid. Picks trump + a partner card.
- **Dealer** = whoever starts the next game's play. In our model: previous Caller (or random for game 1).
- **Partner** = anyone holding a copy of the called card. Identity hidden until they play that card.

Deck (65 cards): two standard decks with 2s/3s/4s/6s removed AND all 7s removed except one 7♠.

Point cards (300 total): Q♠ = 30 · A = 15 · 10 = 10 · 5 = 5

Bid: 150–300 in +5 steps. Random first bidder. Pass = out of bidding.

---

## AI personalities (production)

All in `aiHard.ts` (except normal/random in `ai.ts`).

| ID | Lobby label | Weights slot | Description |
|---|---|---|---|
| `random` | Random | — | Always passes; plays random legal card |
| `normal` | Normal | — | Greedy +5 bidding (cap 200); greedy play with smear-to-known-ally |
| `hard` | Hard | `DEFAULT_HARD_WEIGHTS` | Locked rule-based baseline (gen 1) |
| `hard-2` | Hard-2 | `gen2HardWeights` from `tuned_weights_gen2.json` | First evolutionary tuning (gen 2) |
| `hard-3` | Hard-3 | `activeHardWeights` from `tuned_weights_gen3.json` | Tuned + alliance inference + void-creation (gen 3) |
| `hard-4` | Hard-4 (preview) | Rust crate `bq-ai` (WASM) | Information-Set MCTS + belief tracker. Different paradigm: search over hidden-info determinizations, not utility scoring. Bid + declare currently delegate to Hard-3 (gated off in `hard4Driver.ts`). |

Current strength ordering (mirror-replay verified):
- Hard-4 vs Hard-3: **+3.92pp** (500 pairs, ~4σ) — Session 2 with intent inference
- Hard-4 vs Hard-2: **+3.80pp** (300 pairs)
- Hard-4 vs Hard:   **+5.32pp** (500 pairs)
- Hard-4 vs Normal: **+7.20pp** (200 pairs)
- Hard-3 vs Normal: +15.65pp
- Hard-3 vs Hard:   +4.55–6pp
- Hard-3 vs Hard-2: ~0pp
- Hard-2 vs Hard:   +2.2–3.85pp

Hard-4 is the strongest AI. Decisive lever was opponent-intent Bayesian inference (Session 2) — without it, Hard-4 ≈ Hard-3.

**Important:** Hard-4 strength is highly sensitive to measurement. Regular arena (random seat assignment) can show ±3pp variance at 300-game N. Use `_mirror_arena.ts` for any measurement under ~5pp.

---

## HardWeights — the tunable scoring function

`HardWeights` (`aiHard.ts`) is the tunable surface. ~55 scalar weights covering:

- **Trump scoring** (`trumpLengthFactor`, `trumpTopFactor`, void bonuses, Q♠ bonus, …)
- **Partner-card scoring** (`partnerAceScore`, `partnerQSpadesScore`, trump bonus, …)
- **Bid capacity** (`bidSelfCaptureFromPoints`, `bidVoidBonusFull`, `bidCap`, risk penalties, …)
- **Move scoring** (`smearBonusMul`, `enemyFeedPenaltyMul`, `cheapestWinnerPenaltyFactor`, …)
- **Q♠ commit/dump** (`qSpadesCommitBonus`, `qSpadesDumpPenalty`, `qSpadesCommitThreshold`)
- **Void creation** — discard-side: `voidCreateSingletonBonus`, `voidCreateDoubletonBonus`, `voidCreateTrumpGate`
- **Alliance inference** — point-feed deduction: `inferSmearStrength`, `inferSmearThreshold`, `inferAllyThreshold`

When adding a new weight: also add a clip range to `mutate()` in BOTH `tune.ts` and `tune2.ts`.

`DEFAULT_HARD_WEIGHTS` is the locked baseline for personality `hard`. Don't mutate it casually — it's the standard against which all gens are measured.

---

## Common operations

### Run the app locally
```bash
npm run dev          # starts Vite dev server (already managed by preview_start)
```

### Headless arena benchmark (CLI)
```bash
npx tsx src/game/arena.ts 2000 hard-3,hard          # 2000 games, mix of personalities
npx tsx src/game/arena.ts 2000 hard-3,hard,normal   # 3-way mix
npx tsx src/game/arena.ts 2000 hard-3,hard-3,hard,hard,normal   # fixed seat layout (5 tokens)
```

### Tournament: head-to-head across gens
```bash
npx tsx src/game/_tournament.ts 3000     # matrix: v2 vs v1, vs hard, vs normal
```

### Tune a new generation
```bash
# Single-opponent (vs Hard only) — prone to opponent-overfit:
npx tsx src/game/tune.ts 80 12 80          # gens × lambda × games-per-eval

# Multi-opponent (vs Hard + v1) — recommended:
npx tsx src/game/tune2.ts 80 12 120
```
Output → `tuned_weights.json`. After verifying with `_tournament.ts`, archive as
`tuned_weights_v{N}.json` and copy into `src/game/tuned_weights_gen{N}.json` so the
browser picks it up via `main.tsx` imports.

### Smoketest (catch illegal plays after any AI change)
```bash
npx tsx src/game/smoketest.ts
```

### A/B a new feature (gated by a weight)
Template lives in `_ab_void.ts` and `_ab_infer.ts`. Pattern: same seed pair,
toggle the weight set ENABLE vs DISABLE, measure per-seat win-rate delta.

### Smoke a new personality / route
```bash
npx tsx src/game/_verify_personalities.ts    # confirms hard / hard-2 / hard-3 produce distinct behavior
```

### Mirror-replay arena (variance-canceling — preferred for measuring small edges)
```bash
npx tsx src/game/_mirror_arena.ts 500 hard-4 hard-3   # 500 seed pairs = 1000 games
```

### Mixed-AI qualitative observer (true TS personalities)
```bash
HARD4_TIME_MS=80 npx tsx src/game/_observe_games.ts 4 53001 hard,hard-2,hard-3,hard-4 docs/game_traces
```
Use this for human review across Hard / Hard-2 / Hard-3 / Hard-4. The Rust
`dump_game` tracer is only truthful for all-Hard-4; its mixed labels are
budget-scaled Hard-4 variants, not the real TypeScript personalities.

### Hard-4 (Rust/WASM) operations
```bash
# Native unit tests
cd rust && cargo test

# Native smoke test (5000 games / sec)
cd rust && cargo run --release -p bq-cli -- smoke 5000

# Build WASM for browser (both targets needed)
cd rust/crates/bq-wasm && wasm-pack build --target web    --release --out-dir ../../../src/game/wasm      && rm -f ../../../src/game/wasm/.gitignore
cd rust/crates/bq-wasm && wasm-pack build --target nodejs --release --out-dir ../../../src/game/wasm-node && rm -f ../../../src/game/wasm-node/.gitignore

# Adjust per-move search budget (default 300 ms in browser; arena.ts respects env)
HARD4_TIME_MS=800 npx tsx src/game/arena.ts 300 hard-4,hard-3

# A/B-test gated Hard-4 features
BQ_ENDGAME=1   npx tsx src/game/_mirror_arena.ts 300 hard-4 hard-3   # exact endgame solver (default OFF — regresses)
BQ_BIDPRIOR=1  npx tsx src/game/_mirror_arena.ts 300 hard-4 hard-3   # bid-strength belief prior (default OFF — regresses)
```

---

## Adding a new AI generation (Hard-N)

1. Add or modify weights in `HardWeights` + `DEFAULT_HARD_WEIGHTS`.
2. If behavior changes, add a clip range in BOTH `tune.ts` and `tune2.ts` `mutate()`.
3. Smoketest. Should report 0 illegal plays.
4. A/B test the feature at defaults (see `_ab_void.ts` as template). If it's not directionally positive, reconsider before tuning.
5. Tune with `tune2.ts` (multi-opponent). Watch for noise: if generations don't beat v1 in independent tournament, it's overfit to eval seeds — don't ship.
6. Once a tuned set wins in independent tournament:
   - `cp tuned_weights.json tuned_weights_v{N}.json`
   - `cp tuned_weights.json src/game/tuned_weights_gen{N}.json`
   - In `aiHard.ts`: add a new slot (e.g., `gen3HardWeights`) and `hardNBid/Declare/Play` entry points.
   - In `ai.ts`: route the new personality.
   - In `types.ts`: extend `AIPersonality`.
   - In `main.tsx`: install the new gen weights at startup.
   - In `Lobby.tsx`: add the option.

---

## What we tried that didn't work

Avoid re-spending budget on these:

- **Single-opponent ES tuner** (`tune.ts`) tends to opponent-overfit: candidates beat Hard on training seeds but lose to prior tuned generations on fresh seeds. Use `tune2.ts` (multi-opponent) instead, and ALWAYS verify with `_tournament.ts` before shipping.
- **Soft alliance probability** in `scoreMove` (smear/feed scaled by `allyProb`) regressed Hard-2 by ~1pp because the existing weights were calibrated for a binary gate. Use threshold-upgrade gating (`inferAllyThreshold = 0.85`) instead — it preserves binary behavior on uncertain cases.
- **Void creation at high default values**: the feature is only weakly positive (+0.24pp at defaults). Don't put it on a critical path; let the tuner decide weight values.
- **Renaming "trick" → "round" in code internals**: would collide with the existing "round" concept (= the full game in our single-game model). UI-only rename is the right scope.

### Hard-4 specifically (Session 1.7 A/B results)

- **Pure minimax endgame solver** (`endgame.rs::solve_endgame` at ≤10 remaining cards) regressed by ~1pp in mirror replay. Assumes adversarially-optimal opponents, but Hard-3 plays heuristically; solver picks moves good against perfect opponents but suboptimal against the heuristic opponent. Kept in code (gated by `BQ_ENDGAME=1`); future fix is ISMCTS-in-endgame, not pure minimax.
- **Naive bid-strength belief prior** (`belief.rs::apply_bid_strength_prior`) regressed by ~3pp at default weights. Bumps high bidders' probability of holding aces/Q♠/kings, but the bump magnitudes (1.3x/1.5x) were uncalibrated. Kept in code (gated by `BQ_BIDPRIOR=1`); needs ES tuning of the prior strength.
- **Reading the regular arena (`arena.ts`) for small Hard-4 strength edges**: random seat assignment makes ±3pp noise common at 300-game N. We initially over-reported Hard-4's strength by ~3pp before adding mirror replay. Use `_mirror_arena.ts` for any measurement under ~5pp.
- **Low-point enemy-discard guard** (`hard4.rs::low_point_enemy_discard_guard`) is default ON. It post-processes an ISMCTS move only when Hard-4 chose a non-trump point-card discard onto an enemy-winning trick and a cheaper non-trump discard is legal. It preserves smears to ally-winning tricks and avoids revealing partner card only because it is cheap. A/B: 30ms N=300 was -0.33pp; 80ms N=300 was +1.20pp; 80ms N=500 was +1.24pp. Treat as a modest tactical fix, not a new generation.

---

## Conventions

- **Reducer purity**: `engine.ts` functions must be pure (no `Math.random()` outside `dealHands`, no globals). They're called from the ES tuner under seeded RNG.
- **AI weights flow**: AI decisions take `HardWeights` as a parameter; the dispatcher in `ai.ts` selects the right slot. NEVER read `tuned_weights.json` directly from a non-CLI file.
- **Browser ≠ Node**: anything under `src/` runs in the browser, no `fs`/`process`/etc. CLI sim tools (`arena.ts`, `tune.ts`, etc.) live under `src/game/` but are excluded from the app build via `tsconfig.app.json`.
- **Tailwind v3**: arbitrary values via `[ ]`; classnames stay readable, no `clsx`/`tailwind-merge` dependency.
- **Card pack assets**: served from `public/cards/` (htdebeer.svg, jorel/*.png, poker-qr/*.svg). Never inline binary art into components.
- **Component memoization**: `CardView` is memoized (custom comparator) because it renders up to 65 times in round review. When adding heavy children that render N>5 times, consider memo.
- **Z-index stacking**: HandStrip is `z-30`. Popups originating from `z-20` containers (PlayerSeat, CollectionDeck) bump their container to `z-50` on hover so the popup escapes the parent stacking context.

---

## Files Codex is allowed to create freely

- New `src/game/_*.ts` files for one-off harnesses (A/B tests, verification scripts). Add them to `tsconfig.app.json` exclude.
- New tuned weight archives `tuned_weights_v{N}.json` and `src/game/tuned_weights_gen{N}.json`.
- New `HardWeights` fields (with `mutate()` clip range updates).

## Files Codex should NOT modify without asking

- `DEFAULT_HARD_WEIGHTS` numeric values — this is the locked Hard baseline.
- `src/game/engine.ts` reducer signatures — they're used by the tuner.
- `public/cards/*` binary assets — verified safe; re-fetching/replacing requires a security pass.
