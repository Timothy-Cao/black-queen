# Experiment: Hard-4B — observation-driven iteration on Hard-4

**Goal:** create Hard-4B by watching Hard-4 play games with varied/random opponents,
finding its mistakes *from its own information perspective*, diagnosing the root
cause, and fixing the algorithm (new mechanism if needed) — iterating until no
observable mistakes remain. Then place Hard-4B on the bot Elo ladder to see where
it lands relative to Hard-4 and the rest.

## Critical methodology — imperfect-information critique

Hard-4 plays under hidden information. A "mistake" must be judged ONLY on what
Hard-4 could know at decision time:
- ✅ Its own hand, all played cards, the bidding history, trump, the called
  partner card, and any **revealed** partners (partner card already played).
- ✅ Sound probabilistic inference from the above (e.g. "an enemy is void in
  hearts because they discarded on a heart lead").
- ❌ NOT the opponents' actual hidden hands (the trace shows them god-view for
  OUR analysis, but a play is only a "mistake" if it was wrong given Hard-4's
  knowledge — not merely unlucky against the actual layout).

A play that loses to a hidden card Hard-4 couldn't have known about is **variance,
not a mistake.** Only flag plays that are dominated given the information set.

## Iteration protocol (repeat until clean)

1. **Observe.** Generate N games with Hard-4 + varied opponents at a versioned
   trace dir: `docs/game_traces/<date>__<sha>__hard4b-iterN/`.
   ```
   HARD4_TIME_MS=80 npx tsx src/game/_observe_games.ts <N> <seed> \
     hard-4,random,normal,hard,hard-3 docs/game_traces/<dir>
   ```
   (Fixed 5-token layout guarantees Hard-4 is seated; vary the mix across runs.)
2. **Review.** Read every Hard-4 decision. For each, ask: given only what Hard-4
   knew, was there a strictly better play? Record candidate mistakes with the
   info-set justification (not god-view).
3. **Diagnose.** For each confirmed mistake, find the root cause in the algorithm
   (ISMCTS search depth/budget, rollout policy, belief/determinization sampling,
   intent inference, a guard gap, bidding, declare). Distinguish *systematic*
   flaws (worth fixing) from *one-off search noise*.
4. **Fix.** Implement in the Rust `hard-4b` variant (gated; see scaffold below).
   Prefer a targeted mechanism that addresses the specific flaw. Rebuild WASM.
5. **Re-observe.** Same seeds + new seeds. Confirm the specific mistake is gone
   and no regression appeared. Repeat from step 1.
6. **Stop** when a full review batch surfaces no information-set mistakes.

## Scaffold (how Hard-4B is wired)

- Rust: a `hard-4b` code path in `bq-ai`, toggled per-decision via a global flag
  (set before each play call, like `set_rollout_policy_wasm`). Initially **identical
  to Hard-4** (no-op) → sanity check that Hard-4B ≈ Hard-4 on the ladder before any
  change. Each iteration adds one gated improvement.
- `hard4Driver.ts`: `hard4bPlay/Bid/Declare` set the flag, then call the engine.
- `ai.ts`, `types.ts`, `Lobby.tsx`: add the `hard-4b` personality.
- Ladder: add `hard-4b` to the `place` workflow:
  `HARD4_TIME_MS=80 npx tsx src/game/_elo_rr.ts place hard-4b 500`

## Success / ladder placement

- A real improvement → Hard-4B's placed Elo is **above Hard-4's** with
  non-overlapping (or clearly higher) 95% CI.
- Validate with the variance-cancelled mirror too:
  `_mirror_arena.ts 500 hard-4b hard-4` should show a positive edge.
- Per the session's hard lesson: trust nothing under N≈5000 / Z>2 before claiming
  a win. A placed Elo bump within CI of Hard-4 = no real gain.

## Prior context (don't re-discover)

From this session's lever-hunt (`docs/hard5_roadmap.md`):
- **Heuristic injection into the search consistently HURTS** (PUCT prior, tactical-
  rollout-vs-greedy, bid belief-prior all regressed/were null). Hard-4's ISMCTS
  beats hand-coded guidance. So a fix should sharpen the *information* the search
  uses, not bolt on more heuristics.
- The decisive Hard-3→Hard-4 lever was **opponent-intent inference** — improving
  what Hard-4 *knows/infers* is the historically productive direction.
- Tree-ISMCTS, UCB-c, endgame, bidCap: all null. Don't repeat.
- The genuinely promising untried lever: **learned card-location inference**
  (`docs/hard5_literature_plan.md`, AUC 0.865) — heavier, but the right kind of
  change (better inference, not more heuristic).

So Hard-4B observation will likely surface either (a) a concrete inference gap
(Hard-4 not using some knowable signal) or (b) a tactical guard gap — both fixable
in the spirit of "better information," consistent with what has worked before.
