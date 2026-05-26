# Hard-4 Session 1 — Outcomes

**Branch:** `hard-4-session-1`
**Spec:** [../specs/2026-05-26-hard-4-ai-design.md](../specs/2026-05-26-hard-4-ai-design.md)
**Plan:** [../plans/2026-05-26-hard-4-session-1.md](../plans/2026-05-26-hard-4-session-1.md)

## What shipped

A new `hard-4` AI personality, selectable in the lobby as "Hard-4 (preview)". Plays via Information-Set Monte Carlo Tree Search over a hard-constraint belief state, implemented in Rust and shipped to the browser via WASM. Hard / Hard-2 / Hard-3 frozen and untouched.

### Stack delivered

- **Rust workspace** (`rust/`) — 4 crates:
  - `bq-engine` — pure port of the TS reducer. 21 tests passing.
  - `bq-ai` — belief tracker (hard constraints), determinization sampler, ISMCTS, Hard-4 entry points. 8 tests passing.
  - `bq-wasm` — wasm-bindgen JSON wrappers. Builds 187KB `.wasm` artifact (73KB gzipped).
  - `bq-cli` — native binary. Smoke subcommand runs 5000 games in 0.08s (63k games/sec).
- **TypeScript bridge** (`src/game/hard4Driver.ts`) — projects TS GameState to Rust JSON; dispatches to WASM in both browser and Node.
- **Wired** into `ai.ts` dispatcher, `types.ts` AIPersonality union, `Lobby.tsx` dropdown, `main.tsx` startup warming.
- **Vite production build** confirmed: 187KB wasm + 296KB JS bundle.

### Tests

- 21 native unit tests in `bq-engine` (types, deck, rules, full random games)
- 8 native unit tests in `bq-ai` (belief, sampler, ISMCTS, hard4 full game)
- 5000-game CLI smoketest: 0 invariant failures
- 200-game Node arena: 0 illegal plays

## Initial arena (300 games equivalent, hard-4 vs hard-3)

200 games, random seat mix:
```
personality   |  played  |  called  | call-made% | avg-bid | avg-cap | team-win%
hard-4        |      487 |       25 |      68.0% |   199.4 |   219.6 |    51.3%
hard-3        |      513 |      175 |      70.9% |   220.0 |   243.0 |    54.0%
```

**Headline numbers:**
- Hard-4 plays 200 games with **0 illegal plays** in 60s (3 games/sec at 300ms search budget per move).
- Hard-4 team-win rate is **51.3%** vs Hard-3's **54.0%** — gap is within noise at this N.
- Hard-4 *bids* only 25 times vs Hard-3's 175 — the placeholder bid heuristic is conservative.
- Hard-4 *call success rate* is comparable (68% vs 71%) despite using a crude declare heuristic.

**Honest read:** the play-phase architecture is sound — Hard-4 is roughly Hard-3's peer on raw play even with no tuning and no soft signals. The headline-team-win gap is mostly driven by the asymmetric bid distribution (Hard-4 defends 7× more often than it calls), not by play strength.

## Key design adaptations made during implementation

- **`std::time::Instant` panics on `wasm32-unknown-unknown`.** Resolved by `#[cfg(target_arch = "wasm32")]` gating; WASM uses iteration-budget-only, native uses real wall-clock deadlines.
- **Multiset belief representation.** Cards in our deck have no instance id (two copies of most cards are identical `Card` values), so a `HashSet<Card>` collapses duplicates. Switched to `HashMap<Card, u8>` count-based representation; sampler flattens to instances at runtime.
- **Synchronous Node WASM load via `createRequire`.** The web target is async (must `await init(wasmUrl)`), but arena.ts runs sync. The Node target is CJS under the hood and finalizes WASM at `require()` time, so we use `createRequire(import.meta.url)` at module init to populate `bq` synchronously.
- **`winning_bid` derived from bids array during bidding.** TS engine only sets `RoundState.winningBid` at `enterDeclaring`; during bidding it's undefined. Rust needs it to compute the next legal bid, so the driver computes `max(b.amount)` from the bids array as fallback.

## Open gaps / known limitations (deferred to Session 2+)

- **Bid heuristic is conservative** — only bids when ≥2 aces, Q♠, or 6+ suit. Strongest lever for an immediate Session 2 win is replacing this with a belief-aware capacity estimate or ISMCTS-over-candidates.
- **Declare heuristic is crude** — longest suit as trump, highest-ace-not-held as partner. Also a Session 2 candidate for ISMCTS evaluation.
- **Belief tracker uses only hard constraints.** No bid-strength priors, no withhold detection, no smear inference. All planned in spec.
- **Random rollouts** in ISMCTS leaves. Hard-3's `scoreMove` as a guided rollout policy would significantly strengthen the search.
- **No endgame solver.** Last 3 tricks could be exhaustively enumerated.
- **No tuning yet.** The ~5 search/belief scalars (UCB exploration, time-to-iterations ratio on wasm, etc.) are at defaults. ES tuning is the natural Session 3 task.
- **No Web Worker.** WASM runs on main thread; ~300ms UI stutter per AI turn in the browser. Worker is a one-task addition.
- **No AI Info modal section for Hard-4** — UI work deferred until Hard-4 ships a stronger version.

## Recommended Session 2 ordering

1. **Tune the bid heuristic FIRST.** Even before any architectural improvement, fix the bid-rate asymmetry. A 30-line change to use a belief-aware capacity estimate could move the team-win rate by several pp.
2. **Replace random rollout with `scoreMove` from Hard-3.** Port the scoring function to Rust (or call back into TS — slower but ports for free). Single biggest play-strength lever.
3. **Add soft belief signals** — bid-strength prior, withhold detection. Both are small additions to belief.rs.
4. **Move WASM to a Web Worker** — UI hygiene.
5. **Validate with 5000-game tournament.** Lock in Hard-4 as a shippable personality if it clears the +1pp ship gate from the spec.

## Files touched this session

**New:**
- `rust/` workspace + 4 crates (~1400 LoC)
- `src/game/hard4Driver.ts`
- `src/game/wasm/` (web target, 5 files)
- `src/game/wasm-node/` (node target, 5 files)
- `docs/superpowers/specs/2026-05-26-hard-4-ai-design.md`
- `docs/superpowers/plans/2026-05-26-hard-4-session-1.md`
- `docs/superpowers/sessions/2026-05-26-hard-4-session-1-notes.md` (this file)

**Modified:**
- `src/game/types.ts` (+1 char: `"hard-4"`)
- `src/game/ai.ts` (3 dispatch cases)
- `src/game/arena.ts` (perSeat + summarize updates)
- `src/components/Lobby.tsx` (1 option)
- `src/main.tsx` (warmWasm call)
- `package.json` (build:wasm script)
- `.gitignore` (Rust target/)

**Frozen (untouched as promised):**
- `DEFAULT_HARD_WEIGHTS`, `tuned_weights_gen{2,3}.json`, `aiHard.ts` impl
- `src/game/engine.ts`, `rules.ts`, `deck.ts`
- All UI components except Lobby (1-line addition)

## Build + run commands

```bash
# Native tests
cd rust && cargo test

# Rust CLI smoke (5000 games)
cd rust && cargo run --release -p bq-cli -- smoke 5000

# Rebuild WASM (both targets)
npm run build:wasm
cd rust/crates/bq-wasm && wasm-pack build --target nodejs --release --out-dir ../../../src/game/wasm-node

# Headless arena
npx tsx src/game/arena.ts 200 hard-4,hard-3

# Browser dev server (Hard-4 selectable in lobby)
npm run dev

# Production build
npm run build
```

## Commit log

15 commits on `hard-4-session-1`:
```
docs(hard-4): Session 1 design spec + implementation plan
feat(hard-4): scaffold Rust workspace (bq-engine, bq-ai, bq-wasm, bq-cli)
feat(bq-engine): core types (Suit/Rank/Card/Phase/GameState) with serde + tests
feat(bq-engine): seeded RNG + 65-card deck builder + dealer
feat(bq-engine): legal_play_indices + trick_winner with rules tests
feat(bq-engine): bid/pass/declare/play/collect_trick state transitions
feat(bq-cli): smoke subcommand — 63k games/sec, invariants verified
feat(bq-ai): belief tracker (hard constraints) + determinization sampler
feat(bq-ai): random rollout + ISMCTS (UCB1, time-budgeted, root-stats)
feat(bq-ai): hard4 entry points (bid/declare heuristic, play via ISMCTS)
feat(bq-wasm): JSON I/O wrappers + wasm-pack build to src/game/wasm
feat(hard-4): TypeScript driver bridging GameState to WASM JSON
feat(hard-4): wire into AI dispatcher + Lobby + warm WASM at startup
fix(hard-4): WASM compat + arena hard-3/hard-4 stats
docs(hard-4): Session 1 outcome notes + next-session checklist  ← this commit
```
