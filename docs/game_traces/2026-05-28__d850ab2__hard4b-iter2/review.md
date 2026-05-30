# Hard-4B — iteration 2 observation review

**Batch:** 12 games, Hard-4 in seats P0 **and** P2, vs strong opponents (hard-3 ×2,
hard-2). Strong opponents punish errors → clearer mistakes.

## Hard-4 as caller: strong (5/6 made)
880001✓ 887920✓ 895839✗ 919596✓ 927515✓ 959191✓. The one failure missed by **5**.

## THE FINDING — point card dumped onto a known enemy (guard miss)

**Game 895839, Round 10.** P0 (hard-4) is caller (♦, 240); P2 (hard-4) and P4 are
its revealed partners (both played Q♠ earlier → known team by R9). P1/P3 are enemies.

- R10: P0 leads J♣. P1 (enemy) wins with Q♣. P2 is void in clubs → must discard.
- P2 legal: **A♠, 10♠, 9♠, 9♠** (all spades; ♦ is trump).
- P2 played **A♠ (15 pts)** — onto the **enemy-winning** trick. 9♠ (0 pts) was legal.
- Result: 15 points handed to the enemy (P1 took the trick), AND P2 wasted its boss
  spade. **Caller team finished 235 vs bid 240 — failed by 5.** This one play is the
  whole margin.

**This is dominated from Hard-4's own information:** P2 knows P0/P4 are its partners
and P1 is an enemy (both partners revealed); dumping a 15-pt Ace onto an enemy with
a 0-pt spade in hand is strictly worse than discarding the 9♠.

### Why it matters: the guard *should* have caught it
`low_point_enemy_discard_guard` exists precisely for this: a point-card discard onto
a known-enemy-winning trick with a cheaper non-trump alt → swap to the cheapest. Here
chosen=A♠(15), winner=P1(enemy), cheaper alt=9♠(0). The guard should have swapped
A♠→9♠ but didn't. → **diagnose why** (suspects, in order):
1. `compute_value_players(state, P2)` mis-identifies the team for a *partner* (vs a
   caller) — e.g. doesn't include P1 in enemies / treats winner as ally.
2. The guard's cheaper-alt filter rejects 9♠ for some reason (partner-card/edge case).
3. The guard isn't applied on this path.

## Other Hard-4 plays
Mostly sound across the 12 games. Several flagged Q♠/A♠ discards were **correct
smears onto the caller's own winning trick** (partner feeding points to caller) —
not mistakes. The R10 A♠ dump is distinct because the winner was an **enemy**.

## Hard-4B iteration-2 mechanism
**Fix the known-enemy point-dump guard** so it reliably prevents discarding a point
card onto an enemy-winning trick when a cheaper card is legal — for partners, not
just the caller. This is a correctness fix, not a heuristic. Expected to help in the
exact spot that cost game 895839. A/B via mirror-arena + ladder placement as usual.

(Supersedes the iter1 budget-reallocation lever, which was +0.68pp / noise.)
