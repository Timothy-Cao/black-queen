# Envoy (hard-3) hardening — iteration 1 observation review

**Batch:** 10 games, hard-3 in seats P0/P2/P4, vs hard-2 + hard (all-TS, no WASM
contention). Lens: information-set critique.

## hard-3 plays soundly
As caller: 3/4 made (990001, 997920, 1005839 ✓; 1029596 ✗). As partner/defender:
clean — flagged Q♠/point discards were correct smears onto allies' winning tricks.

## Findings

### 1. Team-identification gap (a real bug — FIXED) ★
`knownCallerTeam` (`ai.ts`, shared by hard/hard-2/hard-3) computed `iAmPartner`
from the **current hand only**. Once a partner PLAYS the partner card, it no longer
holds it → `iAmPartner` goes false → the function returns null (until *all* partners
reveal) → the `avoidKnownEnemyPointDump` guard **skips**. So in the window after a
partner reveals but before all partners reveal, a hard-3/hard-2/hard partner could
dump a point card onto an enemy with no guard.

This is the **same class** as the promoted hard-4 value-players bug, but milder:
hard-3 has no inverted search, so the effect is "guard loses protection," not
"actively sabotages." **Fix (unconditional, correctness):** `iAmPartner` is also
true if the player is in `r.revealedPartners` (has played the partner card).
At-worst-neutral; benefits hard, hard-2, hard-3.

### 2. Thin bid on weak-top trump (candidate, n=1 — not acted on)
Game 1029596: hard-3 called ♥ holding `♥QQ101055` — 6 hearts but **Q-high** (no
A/K of trump; the enemy held K♥). Bid 210, failed 185. The bid evaluator may
over-value trump *length* vs *top honors*. But: (a) n=1 could be variance, and
(b) bid-formula tweaks have been **null all session** (bidCap, partner-aware,
archetype). Not pursued without stronger evidence.

## Outcome
- Implemented finding #1 (team-id correctness fix) — builds clean.
- **Measurement deferred:** re-run the bot Elo ladder once compute frees (the
  thrower placement is running). The fix touches hard/hard-2/hard-3, so all three
  may tick up slightly; the ladder CIs (±~10) may not resolve a small effect —
  honest expectation is marginal, justified on correctness grounds.

## Honest note
Like the hard-4 loop, finding a *clear, large* systematic mistake in a decent
rule-based bot is hard — most flagged plays are correct-given-info. The genuine
wins are correctness bugs (team-id), not subtle tuning (which saturates). hard-3
hardening will likely yield marginal, correctness-driven gains rather than a big
jump; a big jump needs the architectural lever (learned inference).
