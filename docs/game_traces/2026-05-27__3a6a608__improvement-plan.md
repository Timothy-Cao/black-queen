# AI improvement plan — 2026-05-27

**Source:** misplay reviews from
- [2026-05-27__3a6a608__mixed-hard-review/review.md](./2026-05-27__3a6a608__mixed-hard-review/review.md) (batch 1, 3 games)
- [2026-05-27__3a6a608__mixed-hard-review-batch2/review.md](./2026-05-27__3a6a608__mixed-hard-review-batch2/review.md) (batch 2, 3 games)

**Commit reviewed:** 3a6a608. Re-run validity check before acting:
```bash
git log --oneline 3a6a608..HEAD -- src/game/ai.ts src/game/aiHard.ts src/game/hard4Driver.ts rust/
```

**Caveat:** 6 games is anecdote, not proof. This plan ranks hypotheses by EV-per-effort; every item must be A/B-measured with `_mirror_arena.ts` (≥500 pairs) before shipping. Per CLAUDE.md: "If it's not directionally positive at defaults, reconsider before tuning."

---

## Priority 1 — Strict-cheapest enforcement on known-enemy contexts

**Affects:** hard-2, hard-3, hard-4 (all three modern tiers).
**Evidence:** 6+ occurrences across both batches (B1 M3/M4/M5, B2 M4/M5/M6).
**Symptom:** AI picks a point card to play onto a known-enemy-winning trick when a strictly-cheaper legal card is available. Examples: 5♦ when Q♦ is legal; 10♦ when 9♦ is legal; J♠ when 5♠ is legal.

**Current code:** `hard4.rs::low_point_enemy_discard_guard` only *avoids the catastrophic* card. It does not rank the remaining legal options by point cost. Hard-2/Hard-3 (TS) have no equivalent guard at all on the follow-suit path.

**Hypothesis:** A "pick strict-cheapest non-trump legal card when the trick is going to a known enemy and you cannot beat it" rule, applied to both discard and follow contexts, will recapture 5–15pt per game where it triggers.

**Suggested change:**
1. Rust: extend `low_point_enemy_discard_guard` to *also* fire on follow-suit when no legal play wins the trick. Pick strict-cheapest legal among non-trump (or any legal if all are trump).
2. TS: add the same guard in `aiHard.ts` `scoreMove` (or as a post-processing step in the play function), gated by an `enforceCheapestOnKnownEnemy: bool` weight, default ON.

**Risk:** could regress cases where the AI was holding a small point card *as a finesse* (e.g., saving 5♠ to win a trick later). Validate with `_mirror_arena.ts` 500 pairs minimum, both hard-3 vs hard-3 and hard-4 vs hard-3.

**A/B harness skeleton:** `src/game/_ab_cheapest.ts`, BQ_CHEAPEST_GUARD_OFF=1 to disable.

**EV estimate:** 5–10pt avg gain per defender-side trick where the guard fires; my rough count from 6 games is ~3 trigger events per game → ~15–30pt per game when defending. Win-rate impact: probably +1–2pp at hard-3 baseline; unsure for hard-4 (already has partial coverage).

---

## Priority 2 — Q♠ commit threshold too conservative for hard-3

**Affects:** hard-3 specifically.
**Evidence:** 2 confirmed costly occurrences (B1 M1 missed +30 vs partner; B2 M3 missed +30 vs free steal of enemy J♠). One of those was a ~+40 vs −10 swing.
**Symptom:** P0 (hard-3) holds Q♠ past the point where the safe-commit opportunity exists, hoping for a "perfect" trick that never comes.

**Current code:** `qSpadesCommitBonus` + `qSpadesCommitThreshold` weights in `HardWeights`. The threshold appears to require *too high* a confidence-of-ally-winning to fire.

**Hypothesis:** Lowering `qSpadesCommitThreshold` (or adding a second trigger: "Q♠ wins the current trick AND no known enemy still has higher trump") will yield +1–3pp for hard-3.

**Suggested change:**
1. Add a new commit gate: `qSpadesStealEnemyTrickBonus` — fires when Q♠ rank-beats the current winner AND the current winner is a known enemy. Default ON, weight to be tuned.
2. Lower `qSpadesCommitThreshold` from current value by ~0.1 and A/B test.

**Risk:** premature Q♠ commit gives 30pt to enemy if any post-mover can over-trump. The "known enemy still has higher trump" gate from item 1 mitigates this. Without that gate, just lowering the threshold may regress.

**A/B harness:** `src/game/_ab_qspades_commit.ts`.

**EV estimate:** these two missed commits were the largest single-play swings in the dataset (~+30, ~+40). Two events / 6 games = 0.33 events per game. If half could be captured: +5–10pt average per game caller-side. Probably +1pp win-rate.

---

## Priority 3 — Smear singletons / mid-value cards onto known-ally winning trick

**Affects:** hard-3, hard-4.
**Evidence:** 4 occurrences (B1 M1 missed Q♠ +30 onto ally; B1 M2 missed A♥/A♣ +15 onto ally; B2 M7 hard-3 missed 10♦ onto ally; B2 M7 hard-4 missed 10♣ onto ally).
**Symptom:** AI holds 10/15/30-point off-suit cards instead of smearing them onto a trick a known ally is already winning.

**Current code:** `smearBonusMul` is the relevant weight, scaling smear desirability. Trace inspection suggests the score isn't dominant when alternatives are 0pt safe discards.

**Hypothesis:** A bonus for smearing **singletons** specifically (cards in a suit of length 1) is the highest-confidence subset — singletons can never be cashed and have ~0 holding value. A weight like `smearSingletonBonusMul` (or a small additive `smearSingletonBonus`) defaulted ON should be straightforward to A/B.

**Suggested change:**
1. New weight `smearSingletonOnKnownAllyBonus` in `HardWeights`, additive (not multiplicative) so it overrides the safe-discard preference.
2. Triggers when: card is singleton in its suit, current trick winner is known ally, card has ≥10 points.
3. Add to `mutate()` clip range in both `tune.ts` and `tune2.ts`.

**Risk:** could regress when the singleton is the partner-card (early reveal) or when defenders might over-trump the ally-winning trick. Add a guard: don't smear singletons if a known-enemy after-mover has trump remaining and the trick isn't trump-led.

**EV estimate:** smaller per-event than Q♠ commit (~+10pt avg), but more frequent (4 events / 6 games ≈ 0.67/game). Probably +0.5–1pp.

---

## Priority 4 — Hard-only patterns (low priority unless touching baseline)

Two patterns appeared only in `hard` (the locked baseline):
- **D (duplicate-ace-doesn't-beat):** P3 played A♦ onto enemy's A♦ lead. The first-played wins, so this is always a 15pt gift.
- **E (K-over-Q rescue not taken):** P2 had K♠ legal and let enemy take Q♠ for −75 swing.

Per CLAUDE.md: `DEFAULT_HARD_WEIGHTS` is the **locked baseline** — "don't mutate it casually." We should NOT fix these in `hard` itself; doing so would invalidate every measurement that uses it as the standard. If we want to address D and E, the right place is to ensure the modern tiers (hard-2/3/4) handle them correctly, then leave `hard` as-is.

Spot-check: are D and E handled by hard-3/hard-4? Should be verified via a dedicated A/B set (constructed positions, not random games).

---

## Execution order recommendation

1. **Priority 1 first** (strict-cheapest). Highest evidence count, smallest code change, lowest regression risk. Likely net +1–2pp at hard-3 baseline.
2. **Priority 2** (Q♠ commit) once P1 is in. Two distinct gates — the "steal enemy-led trick with Q♠" gate is the easiest to add and lowest risk.
3. **Priority 3** (singleton smear) — requires more careful design (partner-reveal interactions, over-trump risk). Build the A/B harness first.
4. **Priority 4** (hard baseline patterns) — don't touch unless deliberately reopening the baseline question.

After each change: re-run `_observe_games.ts` with the same seeds in this batch (270527, 414141) and diff the resulting trace to confirm the specific misplay no longer occurs *before* trusting the win-rate number.

## Open questions to resolve before coding

1. Does `low_point_enemy_discard_guard` in `hard4.rs` currently fire on the strict-cheapest rule, or only on the catastrophic-avoid rule? Reading the source will confirm whether Priority 1 is a *new* rule or a *generalization* of the existing one.
2. Is there an existing `_ab_*` harness pattern we should copy, or do we need a new template? `_ab_void.ts` is the cited template in CLAUDE.md.
3. For Priority 3 — is "known ally" determined the same way in hard-3 (TS) and hard-4 (Rust)? If the alliance-inference thresholds diverge, the same logic might trigger at different times.

These should be answered (reading the source files cited) before opening a code branch.
