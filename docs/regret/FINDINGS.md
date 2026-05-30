# Regret census findings — the Elo wall is architectural, now with data

**Run:** `_regret_miner.ts`, focal = hard-4/Seer, 150 games, 1,575 play decisions,
deal-fixed greedy-continuation counterfactual. 2026-05-28.

## The verdict: there is no dominated-move pattern to guardrail

A *sound* guardrail (one that can only help) requires **dominance** — an
alternative that's strictly better in (almost) *all* worlds consistent with the
information set. In the census that shows up as a bucket with **high mean regret
AND high "alt-better %"** (an alternative was strictly better in most decisions).

**No such bucket exists.** Across every bucket with meaningful sample size, the
alt-better% tops out around **30–50%**, never near the ~70%+ that would signal
dominance:

| info-set bucket | n | mean regret | alt-better% |
|---|---:|---:|---:|
| defender·discard·enemy-winning·noPts·noCheaper | 307 | 3.8 | 21.5% |
| caller·lead·noPts | 148 | 7.4 | 29.7% |
| **caller·lead·playedPts·cheaperExisted** | 66 | 8.9 | **50%** |
| partner·discard·ally-winning | 162 | 2.3 | 17.9% |
| defender·lead | 46 | 10.4 | 45.7% |

Even the worst-looking bucket — **caller leads a point card when a cheaper card
existed** (the exact "opening-lead" mistake I'd flagged by eye) — has alt-better
of only **50%**. A better move existed *half* the time. That's a **coin-flip
judgment call, not a dominated move.** Hard-coding "never lead a point card as
caller" would be *wrong half the time* — which is precisely why the
budget-reallocation fix targeting it came back null.

## What this means

Seer's residual mistakes are **not** tactical blunders you can rule-veto. They're
decisions where the better move **depends on hidden state Seer can't see** — i.e.
the regret is driven by **inference quality and variance**, not dominance. This is
the strategy-fusion / imperfect-information regime:

- **Sound guardrails can't help** — there's nothing dominated left to catch (the
  existing enemy-discard guard already swept up the truly-dominated discards;
  that's why this bucket shows low regret + low alt-better).
- **Heuristic overrides hurt** (proven repeatedly this session) — they'd be wrong
  ~half the time, exactly as the 50% alt-better predicts.

So the wall is **real and architectural**, and now we have *data* saying so, not
just theory. The cheap levers (search tweaks, guardrails, rule tuning) are
genuinely exhausted on Seer.

## The one remaining lever
**Better inference of hidden state** — learned card-location prediction
(`docs/hard5_literature_plan.md`, de-risked at AUC 0.865, and it uses signals like
*bidding* that Seer ignores). That directly attacks the thing the regret census
says is the bottleneck. It's a multi-week build (data → train → Rust inference →
A/B), not a tweak.

## Caveat
The miner uses a **greedy** continuation, not optimal play, so it may
*under-detect* deep positional dominance (a move only revealed as dominated under
perfect continuation). A stronger version would use the exact endgame solver for
the continuation where tractable. But combined with the session-long evidence
(every guardrail/tweak null except actual logic bugs), the conclusion is robust:
**no easy tactical gains remain; the next real strength is learned inference.**

## Recommendation
Two honest options:
1. **Invest in learned inference** — the only lever left for a *meaningfully*
   stronger AI. Multi-week R&D; uncertain payoff but the literature backs it.
2. **Lock in the current suite and ship.** Seer (1220) is genuinely strong, the
   ladder is clean and well-validated, and the AI work has clearly hit diminishing
   returns. The highest-EV move for the *game* is multiplayer (growth), with
   learned inference as a future research track.
