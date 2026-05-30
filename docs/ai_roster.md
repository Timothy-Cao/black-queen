# AI roster — naming & iteration plan

## Why decouple names from the "Hard-N" order
"Hard-2 < Hard-3 < Hard-4" bakes a permanent ranking into the names. But we now
iterate freely (a hardened hard-3 might pass hard-4; a bugfix lifts the whole
family). The **Elo ladder is the live ranking** — names should just be identity.

## Approach (layered — low risk, keeps history intact)
- **Internal personality IDs stay** (`random`, `normal`, `hard`, `hard-2`, …). All
  code/data keys (ai.ts dispatch, elo.json, traces, tuner) are unchanged → zero
  risk to the engine/harnesses.
- **Player-facing codename layer**: a central `BOT_PROFILES` map (id → {codename,
  tagline, mechanism}) used in the **Lobby dropdown** and **Leaderboard**. The
  codename hints at *how the bot thinks*, not how strong it is. Elo shows strength.
- **AIInfoPage keeps the "Hard-N generations" history** (it's an accurate technical
  record); we just add the codename alongside. So "Hard-4" remains the technical
  name; the codename is the friendly identity. e.g. Lobby shows "Seer (Hard-4)".

## Proposed codenames (mechanism-flavored, order-neutral — easy to change)
| id | codename | what it hints at |
|---|---|---|
| random | **Wildcard** | plays at random |
| normal | **Greedy** | greedy grab heuristic (its literal algorithm) |
| hard | **Rulebook** | fixed rule-based scoring |
| hard-2 | **Darwin** | evolutionary-tuned weights |
| hard-3 | **Envoy** | alliance / partner inference |
| hard-4 | **Seer** | belief tracker + ISMCTS search |

A hardened hard-3 would get its own codename (e.g. **Envoy II** or fresh), not a
forced "hard-5".

## Hardening hard-3 (the "Expert" track)
Reuse hard-3's existing infrastructure rather than greenfield:
- Base = hard-3 (`scoreMove` + `HardWeights` + alliance inference, ~1198 Elo).
- Iterate with the observe→diagnose→hard-code loop (the same one that just found
  the value-players bug): generate traces, find a *systematic* rule the AI gets
  wrong, encode the explicit fix as a scored override or rule, A/B it
  (`_mirror_arena` + `_elo_rr.ts place`), keep only if it clears the bar.
- Candidate explicit rules to add (from the user's idea + session learnings):
  void-aware card ordering; known-opponent / known-partner responses; sharper
  bid thresholds; strict-cheapest discard vs known enemies; smear singletons onto
  known allies.
- Honest expectation: lands ~hard-3/hard-4 level; interpretable; the ladder decides.

## Sequencing
1. Land the v2 value-players bugfix (improves the whole hard family) → re-run ladder.
2. Confirm codenames with the user → wire `BOT_PROFILES` into Lobby + Leaderboard.
3. Begin the hard-3 hardening iterations.
