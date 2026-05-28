# Bid calibration investigation — plan & run notes

**Date:** 2026-05-27. **Commit:** 3a6a608. **Author:** Claude + tctctc888.

## Hypothesis

The bidder is a static closed-form function. If we improve play, the bidder doesn't auto-learn the new capture capacity → it underbids. Symmetrically, the optimal bid for a given hand depends on **both** (a) how many points the subject can capture as caller and (b) the option value of letting an opponent overcommit at a higher price. We want to empirically measure the per-hand EV curve over bid levels.

## What the harness measures

Script: [src/game/_bid_calibration.ts](../src/game/_bid_calibration.ts)

For each of N random hands dealt to SUBJECT (seat 0), run the full game 6 times with different bid-cap conditions:

| cap | SUBJECT auction behavior |
|---|---|
| `pass` | always passes — concede baseline |
| `175` | bids normally up to 175, then passes |
| `200` | same up to 200 |
| `225` | same up to 225 |
| `250` | same up to 250 |
| `275` | same up to 275 |

All seats (SUBJECT included) play `hard-3`. Opponents bid normally. Per trial we record: who called, at what bid, did caller team make, SUBJECT's captured points, and `net` (= +winningBid if SUBJECT's team won the hand, −winningBid otherwise).

**The cap=pass row is the option-value baseline.** Comparing cap=N to cap=pass tells you the marginal EV of "willing to bid up to N." Comparing across N tells you the optimal cap per hand-type.

Note this captures **both** effects we discussed:
- (A) **Caller EV at higher bid** — when SUBJECT wins the auction at price ≤N.
- (B) **Forcing opponents higher** — when SUBJECT bids up but loses the auction, the eventual caller pays more than they would have at cap=pass.

## Output schema

JSONL at `docs/bid_calibration/raw.jsonl`. One row per (seed, cap):

```json
{"seed":1000000,"cap":"pass","hand":"A♠ K♠ ...","callerSeat":3,
 "subjectIsCallerTeam":false,"winningBid":200,"made":true,
 "subjectPts":40,"callerTeamPts":215,"net":-200}
```

## Suggested analysis (for next session)

1. **Bucket hands** by features the current bidder cares about: longest-suit length, top-trump score, ace count, has-Q♠, void count.
2. **Per bucket, plot mean(net) vs cap.** Find argmax cap*.
3. **Compare cap\*(bucket) to what the current hard-3 bidder actually bids on that bucket.** A baseline run with no cap (or with cap = 300, effectively no cap) gives the current bidder's behavior.
4. **If systematic under-bidding (cap\* > current avg bid):** confirms the lag-behind-play hypothesis. Magnitude of the gap is the calibration delta.
5. **Per-bucket bid recommendations** become the new bid coefficients (or a lookup table) for a `hard-3.5` bid-only variant. A/B against current hard-3 with `_mirror_arena.ts` ≥500 pairs.

## Caveats

- All 5 seats are hard-3. Real-world deployment faces mixed opponents. A later sweep over opponent-personality is worth doing if the hard-3 result is positive.
- N=1 trial per (hand, cap) → per-hand variance is uncontrolled (opponent play is deterministic given seed, but bucketing averages it out across hands).
- "Push opponent higher" effect (B) is conflated with "win-and-make" effect (A); decomposing them requires extra conditions (skip for v1).
- The harness uses TS hard-3 throughout — Rust hard-4 isn't included. A hard-4 version would need a separate harness that respects WASM init.

## Run command

```bash
npx tsx src/game/_bid_calibration.ts 2000 docs/bid_calibration/raw.jsonl
```

2000 hands × 6 caps = 12,000 games. Empirically ~30–80 games/sec in TS → 2–7 minutes. Background-able.

## Status (this session)

- Harness written and kicked off in background with N=2000 → `docs/bid_calibration/raw.jsonl`.
- Analysis deferred to next session when token budget allows.
- Expected deliverables in next session: bucketed cap\* table + comparison to current hard-3 bidder + go/no-go for a `hard-3.5` bid-only variant.
