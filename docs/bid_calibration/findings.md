# Bid calibration findings — N=20k

**Source:** [raw.jsonl](raw.jsonl) (120k rows), [analysis.md](analysis.md) (per-bucket table).
**Setup:** 5 × hard-3 seats; SUBJECT = seat 0; cap ∈ {pass, 175, 200, 225, 250, 275}.

## Headline

The hard-3 bidder is **self-consistent** at the macro level (cap=275 ≈ cap\* on the biggest buckets), and bidding-vs-passing has **large value** on 8+ trump hands (+50–65 pts/hand). But we found **two structural issues** that the current data already surfaces, plus one we **can't yet measure**.

## Finding 1 — bidding is hugely valuable on 8+ trump hands

| Bucket (8+ trump) | hands | pass net | cap=275 net | Δ (bid up) |
|---|---:|---:|---:|---:|
| len8+_a2_q0 | 3039 | −66 | −1 | **+65** |
| len8+_a1_q0 | 2896 | −101 | −46 | **+55** |
| len8+_a0_q0 | 733  | −143 | −87 | **+56** |
| len8+_a3+_q0 | 1302 | −2  | +49 | **+51** |
| len8+_a1_q1 | 1561 | +59 | +83 | **+24** |

Even weak 8+-length hands (no aces, no Q♠) gain ~56 pts/hand from bidding aggressively. This is partly "bid and make" and partly "push opponents into a contract they fail." The harness conflates both, but the magnitude is real.

**Implication:** any rule that suppresses bidding on long-trump hands is leaving ~50 pts/hand on the table. Worth auditing the bid formula for such gates.

## Finding 2 — the bidder barely differentiates hand strength

`nat_bid` (mean winning bid when SUBJECT called at cap=275) across hand archetypes:

| Bucket | nat_bid | true EV at cap=275 |
|---|---:|---:|
| len8+_a0_q0 (weakest 8+) | 234 | −87 |
| len8+_a1_q0 | 235 | −46 |
| len8+_a2_q0 | 239 | −1 |
| len8+_a3+_q0 | 235 | +49 |
| len8+_a1_q1 | 235 | +83 |
| len8+_a2_q1 | 235 | +116 |
| len8+_a3+_q1 | 229 | +145 |

**Across a 230-point EV swing, winning bid only varies by 10 points (229–239).** Either the bidder is essentially auction-constrained (always passing when 235 is reached) or it isn't reading hand strength.

Caveat: `nat_bid` is confounded by opponent bidding too — stronger SUBJECT hands don't directly produce higher winning bids if opponents pass earlier. To clean this up we'd record SUBJECT's actual *bids during auction*, not just the winning bid.

## Finding 3 — we cannot yet test "is the cap too low?"

The most useful test would be: force SUBJECT to bid above its natural preference (e.g., always bid ≥260 if legal) and see if EV improves. Our `cap` mechanic only constrains *downward* — it can't push the bidder *higher* than its internal preference (~235–240).

Looking at the data, on len8+_a2_q0 the EV is still rising as cap goes from 250 (−6) → 275 (−1). The slope hasn't flattened — there may be room for cap=300 or a forced floor.

## Finding 4 — the original "lag" hypothesis isn't directly testable here

This whole exercise used hard-3 play AND hard-3 bidding. The "play improves but bidder doesn't catch up" hypothesis would require comparing:
- **Bid AI A + Play AI A** (current hard-3) ← what we measured
- **Bid AI A + Play AI B** (current bidder, improved play) ← what we want

The latter needs a stronger play AI in the seat. Hard-4 (Rust/WASM) is the candidate but it's ~100× slower in TS, so the 120k-game scale would need to drop to ~1200 games or run in Rust directly.

## Recommended next runs (in order of value/cost)

1. **Extend caps to {300, "force260", "force280"}** in `_bid_calibration.ts`. The "force" mode overrides the bidder to bid ≥X whenever the auction reaches X−5. This tests if the internal `bidCap` weight should be raised. ~80s of compute.
2. **Record each bid SUBJECT makes during the auction**, not just winning bid. Lets us bucket "what does the bidder choose?" by hand archetype cleanly. Trivial harness change.
3. **Inspect `bidCap` and `bidSelfCaptureFromPoints` weights** in `aiHard.ts`/`DEFAULT_HARD_WEIGHTS`. If `bidCap` is set to ~240, Findings 2+3 are explained — the bidder is hitting a hardcoded ceiling. Raising it (and re-A/B-ing) is a one-line change.
4. **Hard-4-play calibration** (the original lag question). Requires either porting harness to Rust (~1 day) or running the existing TS harness with `hard-4` in seat 0, very low N (~500 hands × 6 caps × ~5s/game ≈ 4 hours). The Rust port is the better investment if we're going to do this regularly.

## What I'd ship from this session

- Don't touch any weights yet — the data is suggestive but not conclusive about the right direction of the fix.
- Run (1) and (3) next session — they're cheap and likely to confirm the hypothesis.
- If `bidCap` turns out to be the bottleneck, the calibration plan upgrades to a **clear single-knob A/B** rather than a re-derivation of the whole formula.
