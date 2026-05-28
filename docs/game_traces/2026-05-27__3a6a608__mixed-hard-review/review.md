# Misplay review — 2026-05-27 batch (commit 3a6a608)

Reviewer: Claude (manual reasoning over trace files).
Scope: 3 games, mixed Hard/Hard-2/Hard-3/Hard-4.

Notation: "smear" = intentionally discarding a point card onto an ally-winning trick. "Throw" = unintentionally feeding a point card to an enemy-winning trick.

---

## Misplay 1 — Hard-3 missed 30pt Q♠ smear onto known partner
**Game 1 (seed 270527), Round 8, P0 (hard-3).**

- State: trump=♦, caller=P1 (own team). Partner P4 had revealed in R3 by playing A♠. P1 led 8♠; P4 wins with K♠. P0 must follow spades.
- P0 hand at this moment: spades = {K♠ Q♠ 8♠ 7♠}, plus A♥ A♣ off-suit. Trace alts confirm {K♠ Q♠ 7♠} alongside chosen 8♠.
- Played: **8♠ (0pt)**.
- Best play: **Q♠ (30pt) smear onto ally P4** → +30 to caller team.
- Why it matters: Q♠ is the largest single point card in the deck. By R8 (late game) the commit-threshold should clearly be crossed — P0 has a guaranteed ally-winning trick in front of it.
- In this game it didn't cost (Q♠ later landed on partner P1 anyway in R13), but the heuristic is brittle: any earlier defender steal would have made this a −30.

## Misplay 2 — Hard-3 missed 15pt smear onto own partner (low-value-card chosen)
**Game 1 (seed 270527), Round 7, P0 (hard-3).**

- State: P1 (caller, own team) won R7 with Q♦ for 0 pts. P0 must discard (off-suit).
- P0 alts: {K♠ Q♠ 8♠ 7♠ A♥ A♣}. Chose **9♠ (0pt)**.
- Best play: **A♥ (15pt)** OR **A♣ (15pt)** smear onto own ally. Both are singletons in P0's hand (only one ♥ and one ♣ remaining), so they can never be cashed — they should be smeared.
- Pattern: this is the same flavor as Misplay 1 — hard-3 hoards high-value off-suit cards instead of smearing them onto known-ally wins.

## Misplay 3 — Hard-3 defender threw 10pts to enemy when 5pt option existed
**Game 2 (seed 278446), Round 5, P3 (hard-3, defender).**

- State: trump=♠, caller=P0. R5: P0 leads 8♠. P2 plays A♠ — **partner reveal**: P2 is now known partner of caller. P3 is third to act, must follow spade.
- P3 alts: {Q♠ J♠ 5♠}. Chose **J♠ (10pt)**.
- Best play: **5♠ (5pt)** → 5pt cheaper to known enemy.
- (Q♠ at 30pt is obviously worst — the known-enemy-discard guard correctly avoided it. But the guard isn't ranking the remaining options by point cost, just avoiding the catastrophic one.)
- **Suggested AI improvement**: extend the known-enemy guard to "pick *strict cheapest* legal play, not just 'not the catastrophic one'."

## Misplay 4 — Hard-3 defender threw 10pts (Q♦) instead of 5pt trump (5♠)
**Game 2 (seed 278446), Round 7, P3 (hard-3, defender).**

- State: P2 (known partner-of-caller, revealed in R5) led 8♣. P3 third to act, must discard or trump.
- P3 alts: {Q♠ 5♠ A♦ K♦ K♦ Q♦}. Chose **Q♦ (10pt)**.
- Cheaper option in alts: **5♠ (5pt)**, which is trump — would actually have stolen the trick from enemy P2 (no one trumped after). Even a plain non-trump 5pt would have been better.
- Same pattern as Misplay 3: hard-3 ranks discards in a way that doesn't reliably pick the strict-cheapest.

## Misplay 5 — Hard-4 follow: played 10♥ when 8♥ was legal vs known enemy
**Game 3 (seed 286365), Round 5, P4 (hard-4, defender).**

- State: trump=♠, caller=P1 (known enemy from declare). R5: P1 leads A♥. P4 must follow ♥.
- P4 alts (legal hearts): {Q♥ 10♥ 8♥ 8♥ 5♥}. Chose **10♥ (10pt)**.
- Best play: **8♥ (0pt)** → saved 10pt for defenders.
- Note: this is a **follow**, not a discard, so the existing `low_point_enemy_discard_guard` (per CLAUDE.md, discard-only) cannot fire here.
- **Suggested AI improvement**: extend the guard to follow-suit context too. When following to a known-enemy-winning trick and you cannot beat it, you should pick the strict-cheapest legal card.

## Ambiguous — Hard-4 5♥ discard when 0pt alts existed
**Game 3 (seed 286365), Round 3, P4 (hard-4, defender).**

- State: P2 just took the trick from P1's K♠ lead with A♠. P4 has not yet seen the partner-card (A♦) played, so **P2's allegiance is genuinely unknown**.
- P4 alts: {Q♥ 10♥ 10♥ 8♥ 8♥ 5♥ A♣ 8♦ 5♦ 5♦}. Chose **5♥ (5pt)**.
- Strict-cheapest 0pt alts: Q♥, 8♥, 8♥, 8♦. Any of these would have been free.
- Defense: hard-4 may be reasoning "5♥ is the deadest weight in my hand, may as well shed it now." But 8♥ is also dead weight and 0pt — strictly dominates 5♥ on cost.
- Confidence: low. Could be principled hand-shaping or could be ISMCTS noise at 80ms budget.

---

## Pattern summary

| Pattern | Affects | Frequency in 3 games |
|---|---|---|
| Missed smear onto **known ally** when high-value off-suit available | hard-3 (Misplays 1, 2) | 2 |
| Defender doesn't pick **strict-cheapest** legal play vs known enemy | hard-3 (Misplays 3, 4), hard-4 follow (Misplay 5) | 3 |
| Discard-side flag fires on follow-side context | hard-4 guard scope | 1 |

## Suggested next actions (not implemented — flagged for discussion)

1. **Strict-cheapest enforcement for known-enemy contexts** — both discard and follow. Generalize the hard4 guard from "avoid catastrophic discard" to "pick cheapest legal among non-catastrophic." Same logic should be considered for hard-3.
2. **High-value smear when ally-winning is known** — hard-3 should treat any singleton 10+pt card as "smear immediately on known ally," not preserve it. Consider a `smearSingletonOnKnownAllyBonus` weight.
3. **Q♠ commit threshold** for hard-3 — appears too conservative late-game. Worth A/B at lower threshold values via `_ab_*.ts` harness.
4. **Re-run this batch** with the same seed after any guard change and diff `review.md` — that's the regression test for these specific positions.

## Caveats

- N=3 games is anecdote, not signal. These observations are hypotheses to feed into a measurement (`_mirror_arena.ts` ≥500 pairs) before any change ships.
- Hard-4 ran at `HARD4_TIME_MS=80` (CLI default). Browser ships at 300ms. The follow-suit "misplay" (Misplay 5) might disappear at higher budget — verify before patching.
- Reviewer is Claude. A human pass over the same traces is recommended for any finding marked actionable.
