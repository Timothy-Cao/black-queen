# Bot Elo ladder

Calibrated strength ratings for the Black Queen AI personalities. Source data:
`elo.json` (regenerate with `src/game/_elo_rr.ts`). Surfaced in-game on the
`/leaderboard` page via `src/data/botLadder.ts`.

## Method

`_elo_rr.ts` — **round-robin of paired-seed mirror matchups → Bradley-Terry → bootstrap CIs.**

- **Paired-seed mirror** (from `_mirror_arena.ts`): each deal is played twice with
  the two bots' seats swapped (`[1 A, 4 B]` and `[1 B, 4 A]`), cancelling deal/seat
  luck. This is what reliably resolves small edges at feasible sample sizes.
- **Uniform field** (1 bot vs 4 identical) so the two compared bots' skill gap
  drives the outcome instead of being diluted by unrelated bots.
- **Bradley-Terry** (the pairwise model Elo is built on) fit by the MM algorithm
  on per-seat win counts → Elo scale, **anchored: random = 1000**.
- **Bootstrap** (resample seed-pairs, refit) → 95% confidence intervals.

Run that produced the current numbers: **500 seed-pairs/matchup (1000 games each),
600 bootstrap samples, HARD4_TIME_MS=80.**

## Ladder

| Rank | Bot | Elo | 95% CI |
|---|---|---:|---:|
| 1 | hard-4 | 1083 | 1079–1088 |
| 2 | hard-3 | 1079 | 1074–1083 |
| 3 | hard-2 | 1077 | 1073–1082 |
| 4 | hard | 1072 | 1068–1076 |
| 5 | normal | 1045 | 1040–1049 |
| 6 | random | 1000 | 1000–1000 |

Ordering matches the independent variance-cancelled mirror-arena evidence
(hard-4 strongest; the hard-2/3/4 tier is close but hard-4 leads). The hard-3 and
hard-4 CIs slightly overlap, but hard-4 leads on both this fit and the deeper
mirror-arena (+3.92pp), so it is ranked #1.

## Pairwise per-seat win-rate (row beats column)

| | random | normal | hard | hard-2 | hard-3 | hard-4 |
|---|---|---|---|---|---|---|
| **random** | — | .411 | .396 | .399 | .391 | .398 |
| **normal** | .589 | — | .462 | .449 | .431 | .443 |
| **hard** | .604 | .538 | — | .500 | .487 | .479 |
| **hard-2** | .601 | .551 | .500 | — | .511 | .491 |
| **hard-3** | .609 | .569 | .513 | .489 | — | .487 |
| **hard-4** | .602 | .557 | .521 | .509 | .513 | — |

This matrix is the clearest "where do they stand" view: hard-4 beats every other
bot head-to-head (all > .500 in its row), and everyone crushes random (~.60).

## Honest note on spread

The spread is modest (~83 Elo from random to hard-4) **and that is correct, not a
measurement artifact.** Black Queen is a 5-player hidden-team game where any single
seat is only 20% of the table — even a perfect bot among weak ones can't dominate
the way 1500-beats-1000 does in chess. So skill→outcome is compressed. Stretching
the scale would be cosmetic; what matters is the **reliable ordering + tight CIs**,
which this gives. The bot↔human Elo offset gets calibrated once real players face
these bots in multiplayer.

## Placing a new bot on the ladder

When a new/iterated AI is added (e.g. hard-4b), rate it against the **fixed**
existing ladder — the placement-match paradigm — without recomputing everyone:

```bash
HARD4_TIME_MS=80 npx tsx src/game/_elo_rr.ts place hard-4b 500
```

It plays paired-seed mirrors vs each rated bot and fits **only** the new bot's Elo
(others held fixed), reporting its placement + 95% CI. Cross-check a claimed
improvement with `_mirror_arena.ts 500 <newbot> hard-4` (expect a positive edge).

## Regenerate the whole ladder

```bash
HARD4_TIME_MS=80 npx tsx src/game/_elo_rr.ts 500 docs/elo/elo.json
```
Then sync `src/data/botLadder.ts` to the new numbers for the in-game leaderboard.
