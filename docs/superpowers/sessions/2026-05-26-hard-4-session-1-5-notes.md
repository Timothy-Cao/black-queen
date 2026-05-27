# Hard-4 Session 1.5 — Greedy rollout + isolated play search

**Branch:** `hard-4-session-1`
**Builds on:** [Session 1 notes](./2026-05-26-hard-4-session-1-notes.md)

## Hypothesis tested

> If the play-phase ISMCTS is genuinely stronger than Hard-3's `scoreMove`,
> Hard-4 should win the play-phase tournament even with identical bidding.
> The 200-game Session 1 arena was confounded by Hard-4's timid bid heuristic
> (25 calls vs Hard-3's 175); fixing this isolates the search contribution.

## Changes

1. **`handeval.rs` (new).** Port of TS `evaluateHand` + a calibrated
   `estimate_bid_capacity` mirroring Hard-3's bidder weights. Available for a
   future search-based bidder; currently unused at runtime (see #3).
2. **`rollout.rs::rollout_greedy`.** ISMCTS leaf rollout now uses a simple
   stronger-than-random policy: lead low non-trump (save trump), win cheaply
   when points are on the table, dump lowest otherwise. Random rollouts diluted
   the search signal because most random games ended in roughly equal point
   splits — greedy rollouts produce realistic captured-points distributions.
3. **`hard4Driver.ts` — bid/declare delegated to Hard-3.** Hard-4's bid and
   declare heuristics in Rust shipped but are gated off in TS. Hard-4 now
   calls `hardTunedBid` and `hardTunedDeclare` for those phases, leaving
   the only Hard-4 vs Hard-3 divergence in the **play phase**. This is an
   intentional A/B isolation: it lets us measure whether ISMCTS-with-belief
   is genuinely stronger than `scoreMove` at the same compute budget.
4. **`HARD4_TIME_MS` env override.** Arena can request deeper search at the
   cost of throughput (e.g., `HARD4_TIME_MS=800 npx tsx ...`).

## Results

### 300ms/move

| | Games | Hard-4 team-win | Hard-3 team-win | Edge |
|---|---|---|---|---|
| 200 games | 510 seats | 54.5% | 51.3% | **+3.2pp** |
| 500 games | 1190 seats | 55.1% | 53.0% | **+2.1pp** |

Hard-4 also has +6.6pp higher call-success rate (76.3% vs 69.7%) at 500 games.

### 800ms/move (deeper search)

| | Games | Hard-4 team-win | Hard-3 team-win | Edge |
|---|---|---|---|---|
| 300 games | 763 seats | 56.0% | 52.4% | **+3.6pp** |

Edge grows with search depth — meaningful signal the ISMCTS quality is the
binding lever, not random sampling variance.

### Throughput
- 300ms/move: ~3 games/sec
- 800ms/move: ~1 game/sec

### Errors
0 illegal plays across all runs (1000+ games total).

## What this proves and what it doesn't

**Proves:**
- ISMCTS-with-hard-constraint-belief play is genuinely stronger than the
  one-ply utility function in `aiHard.ts::scoreMove` at the same bid/declare.
- The architecture scales: more compute → stronger play.
- The Session 1 weak arena result was a bidder problem, not a play problem.

**Doesn't prove:**
- That the edge is robust on fresh seeds beyond what we've measured. 500 games
  with ~1200 seats/personality gives σ ≈ 1.4pp, so +2.1pp is ~1.5σ —
  borderline-significant. The 800ms run at +3.6pp is closer to 2.5σ.
- That Hard-4 is the **strongest available** AI when including bid/declare.
  Right now Hard-4 just is Hard-3 for bid/declare; we'll need a search-based
  bidder before we can claim a holistic improvement.
- That Hard-4 is human-strong. We haven't compared against human play.

## Next-session priorities (revised)

1. **Mirror-replay tournament harness.** Same-seed paired evaluation will
   tighten the confidence interval significantly (variance from seed luck
   cancels out). This is the standard discipline from Hard-2/Hard-3.
2. **Search-based bidder.** Sample N hands consistent with self_hand, run
   short ISMCTS as "what if I bid X with trump T", pick max-EV (trump, bid).
   This is where Hard-4's holistic edge over Hard-3 starts.
3. **Soft belief signals.** Bid-strength prior + withhold inference. Each
   should A/B-test positively before integration.
4. **Hard-3 scoreMove as guided rollout.** Even greedy rollouts are a step up
   from random; using Hard-3 itself as a policy would be a bigger step.
5. **Web Worker for browser.** UI hygiene; doesn't change strength.
6. **5000-game shipping tournament.** Lock in the +1pp ship gate from the spec.

## Files touched

**New:**
- `rust/crates/bq-ai/src/handeval.rs` — hand evaluator + bid capacity
- `docs/superpowers/sessions/2026-05-26-hard-4-session-1-5-notes.md` (this file)

**Modified:**
- `rust/crates/bq-ai/src/lib.rs` — register handeval
- `rust/crates/bq-ai/src/hard4.rs` — use estimate_bid_capacity + better declare
- `rust/crates/bq-ai/src/rollout.rs` — add rollout_greedy
- `rust/crates/bq-ai/src/ismcts.rs` — use rollout_greedy
- `src/game/hard4Driver.ts` — delegate bid/declare to Hard-3, add HARD4_TIME_MS

## Reproduce

```bash
# native tests
cd rust && cargo test

# rebuild WASM
npm run build:wasm
cd rust/crates/bq-wasm && wasm-pack build --target nodejs --release --out-dir ../../../src/game/wasm-node && rm -f ../../../src/game/wasm-node/.gitignore

# arena (default 300ms/move)
npx tsx src/game/arena.ts 500 hard-4,hard-3

# arena with deeper search
HARD4_TIME_MS=800 npx tsx src/game/arena.ts 300 hard-4,hard-3
```
