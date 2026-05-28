# Misplay review — 2026-05-27 batch 2 (commit 3a6a608)

Reviewer: Claude. Scope: 3 games, mixed Hard/Hard-2/Hard-3/Hard-4 (seeds 414141, 422060, 429979).

Game outcomes: all three caller-teams MADE bid. Patterns surface anyway.

---

## Misplay 1 — duplicate Ace wasted to enemy's same-Ace lead
**Game 2 (seed 422060), Round 7, P3 (hard, defender-team-mate to enemy P1).**

- P1 (enemy from P3's perspective; P3 is partner-of-caller) leads A♦.
- P3 alts: {A♦ K♦ Q♦}. Chose **A♦ (15pt)**.
- Best play: **K♦ or Q♦ (0pt)**.
- Why it matters: in two-deck games, first-played wins ties. P3's A♦ cannot beat P1's A♦. P3 just gifted 15pt to the enemy trick.
- Severity: clear blunder. Pattern is *"AI doesn't model that duplicate aces don't win against same-suit duplicate of equal rank already played."*

## Misplay 2 — K♠ rescue not taken; Q♠ goes to enemy
**Game 2 (seed 422060), Round 6, P2 (hard, partner of caller P0).**

- P0 leads 8♠. P1 (known defender) forced **Q♠ (30pt)** — sitting on the table going to enemy.
- P2 alts: {K♠ J♠ J♠ 10♠ 7♠ 5♠}. Chose **5♠ (5pt)**.
- Best play: **K♠** — beats Q♠, wins the trick to caller team, captures the 30pt Q♠ for own side.
- Swing: trick actually ended ~−45 for caller team (Q♠ landed on P1). With K♠, the trick would have been ~+30 instead. **~75pt swing**.
- This is the highest-EV missed play in either batch.

## Misplay 3 — Q♠ commit refused with safe steal available
**Game 2 (seed 422060), Round 10, P0 (hard-3, caller).**

- P2 (known defender) leading the trick with J♠.
- P0 alts: {Q♠ 10♠ 9♠ 9♠}. Chose **10♠ (10pt → defenders)**.
- Best play: **Q♠** — beats J♠ (Q > J), wins the trick for caller team, and *gets Q♠ out of P0's hand safely*.
- At this point in the game, P2 still holds K♠ J♠ J♠ — Q♠ remaining in P0's hand was at imminent risk of being over-trumped. Committing Q♠ when the steal is free is the textbook play.
- Same `qSpadesCommit` weakness flagged in batch 1 Misplay 1. Confirmed pattern across batches.

## Misplay 4 — strict-cheapest violation (hard-2)
**Game 3 (seed 429979), Round 5, P2 (hard-2, defender).**

- P0 (enemy) winning with A♦.
- P2 alts: {10♦ K♦ K♦ Q♦ 9♦ 5♦}. Chose **10♦ (10pt → enemy)**.
- Best play: **9♦ / K♦ / K♦ / Q♦** — all 0pt.

## Misplay 5 — strict-cheapest violation (hard-3)
**Game 3 (seed 429979), Round 6, P1 (hard-3, defender).**

- P0 (enemy) winning with 10♦.
- P1 alts: {5♦ Q♦}. Chose **5♦ (5pt → enemy)**.
- Best play: **Q♦ (0pt)**.

## Misplay 6 — strict-cheapest violation (hard-2, same trick)
**Game 3 (seed 429979), Round 6, P2 (hard-2, defender).**

- Same trick as Misplay 5. Cheapest 0pt available (K♦/Q♦/9♦), P2 played **5♦ (5pt)**.

## Misplay 7 — missed smear onto known ally
**Game 2 (seed 422060), Round 10, P1 (hard-3, defender) and P4 (hard-4, defender).**

- P2 (own ally — both defenders) winning the trick with J♠.
- P1 alts: {K♦ 10♦ 5♦ 5♦}. Chose **K♦ (0pt)**. Should have smeared **10♦ (+10 to defenders)**.
- P4 alts: {J♣ 10♣ 5♣}. Chose **9♣ (0pt)**. Should have smeared **10♣ (+10 to defenders)**.
- Echoes batch 1 Misplays 1–2: AIs hoard mid-value point cards instead of smearing onto known allies.

## Lower-confidence / hard-tier baseline noise (not added to suggested fixes)

- **Game 1 R5/R7 P4 (hard)** — hard-baseline tier; missed smears and gave 10♥ to enemy. Expected from `hard` (the lowest tuned tier); not actionable.
- **Game 3 R3/R4 P0 (hard-4)** — chose 5♣ as smear instead of A♣/A♦. Defensible (5pt smear *is* correct; bigger smears risk losing the ace's later cashing power). Ambiguous.
- **Game 3 R5 P4 (hard)** — J♦ over A♦ to ally; A♦ smear would have been +15 immediate but A♦ was also a potential later winner. Defensible.

---

## Cross-batch pattern summary (batch 1 + batch 2, 6 games total)

| # | Pattern | Tier(s) | Occurrences |
|---|---|---|---|
| A | Strict-cheapest violation onto known enemy (discard *or* follow) | hard-3, hard-4, hard-2 | **6+** (B1 M3, M4, M5; B2 M4, M5, M6) |
| B | Missed smear onto **known ally** with mid/high point card | hard-3, hard-4 | **4** (B1 M1, M2; B2 M7×2) |
| C | Q♠ commit refused when steal is free / safe | hard-3 | **2 confirmed, both costly** (B1 M1, B2 M3) |
| D | Duplicate-ace wasted to same-suit ace lead (doesn't beat) | hard | **1** (B2 M1) |
| E | K-over-Q♠ rescue not taken on enemy-led trick | hard | **1, massive swing** (B2 M2) |

Patterns A, B, C are present in **multiple tiers**, including hard-4. Patterns D and E only appeared in `hard` so far (the locked baseline) — noted but not prioritized.

The Pattern A (strict-cheapest) and Pattern B (mid-value smear onto ally) findings are consistent enough across 6 games to justify a code-level investigation.
