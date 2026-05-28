# HOLD — do not ship cap270 yet

**Date:** 2026-05-27. **Commit:** 3a6a608.

## What we tested

Raising `bidCap` from 240 → 270 in `tuned_weights_gen3.json`, A/B'd via paired-seed mirror replay with weight override on SUBJECT (seat 0) only.

## Result

| condition | N | Δ net vs baseline | SE | Z | %caller | %made (variant) |
|---|---:|---:|---:|---:|---:|---:|
| hard-3 seats | 10,000 | **+6.00** | 0.98 | **+6.13** | 26.0% | 74.7% |
| hard-4 seats @30ms | 3,000 | **-6.87** | 4.49 | -1.53 | 26.0% | 57.9% |
| hard-4 seats @80ms | 500 | **-5.40** | 10.67 | -0.51 | 30.4% | 54.6% |
| hard-4 seats @80ms | 2000 | (running, pid 66661) | | | | |

The hard-3 result is rock-solid. The hard-4 result is **directionally negative** at both budgets, magnitude ~5-7 pts/game, but **never significant** at the N we ran.

## Why it likely doesn't transfer

Hypothesis: hard-4 opponents have a **bid-aware belief tracker** (per CLAUDE.md: "Decisive lever was opponent-intent Bayesian inference (Session 2)"). When SUBJECT bids more aggressively (higher cap → contests more auctions to 250+), opponent hard-4 ISMCTS infers SUBJECT holds a stronger hand and defends differently. The extra contracts SUBJECT wins via the new cap don't make at the same rate they would against heuristic hard-3 opponents.

Evidence: `%made` collapses from 75% (hard-3 throughout) to 55–58% (hard-4 throughout) at the same `%caller` rate. The contracts being taken are similar in difficulty, but the playthrough quality against bid-aware opponents is much worse.

This is itself a finding worth recording: **bidder-only changes in hard-4-vs-hard-4 are non-trivially coupled with opponent inference**. Future bid changes for hard-4 must be A/B'd in the hard-4 setting directly; hard-3 results don't carry over.

## Decision

- **Do not modify `tuned_weights_gen3.json`.** Browser ships gen3 and would inherit a non-validated change.
- Hard-3 in isolation does benefit; if there's ever a `hard-3.5` variant designed for non-hard-4 opponents, the cap270 result is a candidate. But that's not the current priority.
- Wait for the N=2000 hard-4 @80ms run to either confirm "genuinely neutral" (Δ within ±SE) or "directionally negative with tighter SE." Either way, the cap raise doesn't help hard-4, so we don't ship.

## What to investigate next (token-efficient, compute-heavy)

The bid-change-coupled-with-belief-tracker finding suggests the right path for improving hard-4 is **not** standalone bidder tuning. Instead:

1. **Direct play improvements** for hard-4 (from earlier review at [improvement-plan.md](../game_traces/2026-05-27__3a6a608__improvement-plan.md)):
   - **P1: strict-cheapest enforcement** — measured directly in hard-4 traces (Misplay 5). Highest-confidence change, ports to Rust `hard4.rs::low_point_enemy_discard_guard`.
   - **P2: Q♠ commit threshold** — hard-3-side, but hard-4 inherits hardTunedBid-style play patterns. Worth A/B at hard-4 too.

2. **Bid + play co-tuning.** If we want to ship bid changes for hard-4, we need to also adjust play to handle the harder contracts. This is the "search-based bidder" path CLAUDE.md noted but is expensive.

3. **Threshold-binding probe harness.** Generalized version of this experiment: sweep ±20% on every `*Threshold` / `*Cap` / `*Max` weight in `HardWeights` against both hard-3 and hard-4 seats. Catch other dead-zone bugs like bidCap=240/extra=280. Compute is cheap; will document anomalies for follow-up.

## Lesson learned

The original hypothesis "play improvements lag bidder" was clean. The reality is the inverse direction: **bidder improvements measured against weak opponents don't transfer to strong opponents**, because strong opponents adapt to bid signal. Any bidder change must be measured in the play context it'll deploy in.

For hard-4 specifically: the bid weights probably need to be co-evolved with the play AI's belief tracker, not tuned independently against hard-3.
# Bid-weight A/B analysis
source=docs/bid_calibration/weight_ab_hard4_80ms_n2000.jsonl  seeds=2000

|       variant       | n |   Δ net vs baseline   | SE  |  Z  | %caller | % made (when caller) | avg bid (when caller) |
|---|---:|---:|---:|---:|---:|---:|---:|
| cap270               | 2000 |    0.97 | 5.26 | 0.19 | 26.1% | 58.0% | 239.3 |

Δ net = mean(variant.net - baseline.net) on paired seeds (variance-cancelled).
Z > 2 ≈ significant at ~95%, Z > 3 ≈ ~99.7%.
%caller = SUBJECT (seat 0) became caller; %made = of those, won; avg bid = winning bid when caller.
