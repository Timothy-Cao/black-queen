# Bidder weight A/B — bidCap raise gives clear +6 pts/game

**N=10,000** paired seeds. SUBJECT (seat 0) uses modified weights; 4 opponents use baseline hard-3 (gen3). All seats play `hard-3` (same play AI, so divergence is purely from bid choices).

## Results

| variant | bidCap | bidCapExtraordinary | Δ net vs baseline | SE | Z | %caller | %made | avg bid (when caller) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 240 | 280 | — | — | — | (~25%) | (~76%) | (~239) |
| cap250 | 250 | 280 | **+5.56** | 0.89 | **6.24** | 25.7% | 74.9% | 239.4 |
| cap260 | 260 | 280 | **+5.64** | 0.96 | **5.89** | 25.9% | 74.7% | 239.6 |
| cap270 | 270 | 280 | **+6.00** | 0.98 | **6.13** | 26.0% | 74.7% | 239.7 |
| cap280 | 280 | 280 | **+6.05** | 0.98 | **6.16** | 26.0% | 74.7% | 239.7 |
| extra250 | 240 | 250 | **+6.05** | 0.98 | **6.16** | 26.0% | 74.7% | 239.7 |
| extra260 | 240 | 260 | **+4.44** | 0.82 | **5.43** | 24.1% | 76.0% | 238.9 |
| no-cap | 300 | 300 | **+6.05** | 0.98 | **6.16** | 26.0% | 74.7% | 239.7 |

All variants are statistically significant (Z > 5; Bonferroni-corrected threshold for 7 comparisons is Z ≈ 2.69). The effect **plateaus around bidCap=270**: cap270, cap280, extra250, no-cap all give Δ=+6.05.

## Mechanism

- **The cap rarely binds the actual winning bid** (avg ~239 either way). Average bid only rises ~0.7pt.
- **%caller rises ~1pp** (24-25% → 26%). SUBJECT contests slightly more auctions.
- **%made drops 1pp** (76% → 75%). The extra contracts won are tougher.
- Net: the +6pts/game comes from **not folding at 240 in tight auctions** — SUBJECT now stays in past 240, occasionally winning that an opponent would have, or pushing opponents into a tougher contract.

In other words: the bidder isn't biding higher on average; it's just refusing to fold prematurely. The dead-zone between bidCap=240 and bidCapExtraordinary=280 is the bug — capacity 245-279 hands clamp to 240 even when the bidder estimates they'd capture more.

## Concrete recommendation

**Change `bidCap`: 240 → 270** (or equivalently `bidCapExtraordinary`: 280 → 250). Both produce the +6.05 effect.

The simplest single-knob change: `bidCap = 270` in `gen3HardWeights`. Affects:
- `hard-3` bid behavior directly
- `hard-4` bid behavior (delegates to `hardTunedBid` per `hard4Driver.ts`)

`hard` and `hard-2` are not affected (they read separate frozen weight sets).

### Why not just remove the cap entirely?

`no-cap` (bidCap=300, bidCapExtraordinary=300) gives identical +6.05. Removing it is cleaner. But the cap may have served as a safety against hallucinatory capacity estimates ≥320, which weren't tested here. **Conservative recommendation: bidCap=270, leave bidCapExtraordinary=280.** Keeps the safety net at the upper extreme.

## Caveats

1. **Self-vs-baseline ≠ deployment.** This A/B is SUBJECT-only — only seat 0 has the change. In real deployment, hard-3 and hard-4 ALL get the new bidder, so the symmetric edge cancels in hard-3-vs-hard-3 matches. The relevant question is **does new-bidder hard-4 beat old-bidder hard-3 by more than current hard-4 does?** That needs a `_mirror_arena.ts` run with the actual personality swap.
2. **Hard-4 play not measured here.** Hard-4 plays via Rust ISMCTS; this harness runs hard-3 throughout for speed. The +6 effect is on the BIDDING surface only, where hard-3 and hard-4 are identical. Should transfer fully to hard-4, but worth confirming.
3. **`%made` dropped 1pp.** Acceptable given net Δ is positive, but at higher bidCap values (300+) `%made` could degrade further. Don't push bidCap past 270 without re-A/B-ing.

## Suggested next actions

1. **Make the change.** Update `src/game/tuned_weights_gen3.json` (and root `tuned_weights_v2.json` for consistency with the CLAUDE.md convention): set `"bidCap": 270`.
2. **Mirror-arena validation.** Run `_mirror_arena.ts 500 hard-4 hard-3` with the new weights and compare to the baseline +3.92pp Hard-4-vs-Hard-3 number. Net change should be ≥0.
3. **Document as `hard-3.5`** (or call it `hard-3` v2) per CLAUDE.md "Adding a new AI generation" if it ships.
4. **Re-run bid_calibration** at the new cap and look for the next plateau — there may be more headroom in `bidSelfCaptureFromTrump` or `bidVoidBonusFull` for example.
