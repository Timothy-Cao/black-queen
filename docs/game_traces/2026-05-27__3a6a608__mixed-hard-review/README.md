# Mixed hard-AI trace batch

- **Date:** 2026-05-27
- **Commit:** 3a6a608 (`docs: use round in game-facing text`)
- **Tool:** `src/game/_observe_games.ts`
- **Pool:** `hard,hard-2,hard-3,hard-4` (sampled per game; not all games include all personalities)
- **baseSeed:** 270527
- **Game count:** 3
- **Env:** `HARD4_TIME_MS=80`

## Seat layouts

| File | P0 | P1 | P2 | P3 | P4 |
|---|---|---|---|---|---|
| mixed_hard_270527.txt | hard-3 | hard-2 | hard-3 | hard   | hard-3 |
| mixed_hard_278446.txt | hard-2 | hard   | hard-2 | hard-3 | hard-3 |
| mixed_hard_286365.txt | hard-4 | hard-2 | hard-2 | hard-4 | hard-4 |

## Is this trace still current?

```bash
git log --oneline 3a6a608..HEAD -- src/game/ai.ts src/game/aiHard.ts src/game/hard4Driver.ts rust/
```

If any commits appear, AI behavior may have changed since this batch — re-run before drawing conclusions.

## Reviews

- `review.md` — Claude's manual misplay review.
