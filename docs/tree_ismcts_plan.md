# Tree-structured ISMCTS — implementation plan (the Hard-5 candidate)

**Created:** 2026-05-27. **Status:** planned, not started.

This is the only remaining high-EV lever after all flat-MCTS hyperparameters were tuned to null (see `hard5_roadmap.md`). It's a multi-day build; this plan makes it executable cold.

---

## Why this is the lever

Current `ismcts_play` is **flat MCTS**: one `HashMap<Card, ActionStats>` at the root. Each iteration determinizes, picks ONE root action via UCB1, then **rolls out to game end with a fixed policy**. There is no tree below the root — the rollout policy (greedy/tactical) is the *entire* model of all future decisions by all players.

That means: the search never actually *reasons* about opponent responses or its own later moves. It just samples them from a fixed heuristic. The meta-finding ("heuristic injection hurts") is really telling us the rollout heuristic is a weak model — but we can't improve it by making it *smarter* (that biases). We improve it by **replacing rollout with search**: build a tree so later decisions are chosen by UCB statistics (honest, self-correcting) instead of by a fixed heuristic.

Expected upside: this is the same class of change as Hard-3→Hard-4 (architectural). Realistic target: +2 to +4pp if it works.

---

## Algorithm: SO-ISMCTS (Single-Observer Information-Set MCTS)

Reference: Cowling, Powley, Whitehouse, "Information Set Monte Carlo Tree Search" (2012), the SO-ISMCTS variant.

Per iteration:
1. **Determinize.** Sample one full assignment of hidden cards (existing `belief.sample_determinization`).
2. **Select.** Descend the tree from the root. At each node, among actions *legal in this determinization*, pick the child maximizing UCB1. Stop at a node that has an unexpanded legal action (for this determinization) or a terminal.
3. **Expand.** Add one new child for an unexpanded legal action.
4. **Simulate.** Roll out from the expanded node to game end (use greedy rollout — already the best).
5. **Backpropagate.** Update visit/value along the descended path. Crucially also increment the **availability count** of each sibling that was legal in this determinization (the SO-ISMCTS correction).

### The key correctness pitfall: availability counts

In a perfect-info tree, UCB uses `visits_parent` in the exploration term. In ISMCTS, a child is only *available* when the determinization makes it legal. A card that's rarely legal (e.g. a singleton that's only playable when its suit is led) would look artificially under-explored if we used total parent visits.

**Fix:** each child tracks `availability` = number of iterations in which it was legal. UCB exploration term uses `ln(availability_of_this_child)` (or the parent's availability sum), NOT total parent visits. This is the defining feature of SO-ISMCTS and the #1 source of bugs if omitted.

Formula per child `a` at node with the descending determinization:
```
ucb(a) = Q(a) + c * sqrt( ln(N_avail(a)) / n(a) )
```
where `n(a)` = times `a` was selected, `N_avail(a)` = times `a` was available (legal in the descent's determinization). Only iterate over currently-legal children for selection; only bump `N_avail` for currently-legal children on backprop.

---

## Data structures (Rust)

```rust
struct Node {
    // Children keyed by the action (Card) that leads to them.
    children: HashMap<Card, Box<Node>>,
    visits: u64,            // n(a): times this node's incoming action was chosen
    availability: u64,      // N_avail: times this node's action was legal at parent
    total_value: f64,
    // Whose turn it is at this node (needed to know which player's action the
    // children represent, and to apply the right value sign on backprop).
    to_act: PlayerId,
}
```

- Root = the decision node for `self_id`.
- A path through the tree is a sequence of (player, card) plays.
- Tree is per-move (rebuilt each `ismcts_play` call). Tree reuse across moves is a *later* optimization — do NOT attempt in v1.

### Value signedness across players

The tree contains nodes for ALL players' decisions (mixed). Backprop value is always "from `self_id`'s team perspective" = `captured_by_value_players / 300` (same as current). Every node on the path gets the same scalar value added — UCB at an *opponent* node still maximizes that scalar, which is WRONG for a true minimax tree. **For SO-ISMCTS v1 we accept "all nodes maximize self's value"** — this is the standard SO-ISMCTS simplification (it models opponents as also exploring, not as adversarial minimizers). It worked for Cowling's card games. A later refinement is per-player value tracking (MO-ISMCTS), but that's v2.

---

## Implementation phases

### Phase 1 — scaffold + correctness (no perf goal)
- Add `tree_ismcts_play` alongside `ismcts_play` behind a toggle (`BQ_TREE=1` / `set_tree_ismcts_wasm`). Default OFF.
- Implement Node, descent (select), expansion, greedy rollout, backprop with availability counts.
- Depth-limit the tree to `D` plays (start D = 5, i.e. one full trick + a bit); beyond depth D, fall to rollout. Keeps memory and complexity bounded.
- **Tests:**
  - Returns a legal card (mirror the existing `ismcts_returns_a_legal_card` test).
  - On a 1-legal-move state, returns it without building a tree.
  - Determinism under fixed RNG.
  - Availability-count sanity: a singleton-only-legal-when-led action has `N_avail < root.visits`.

### Phase 2 — A/B vs flat MCTS
- Harness: clone `_rollout_ab.ts` → `_tree_ab.ts`, variants = {flat (baseline), tree_D5, tree_D8}.
- Paired-seed, N≥5000 at 80ms, hard-4 vs 4×hard-3.
- **Gate:** ship only if tree beats flat by Z>2 AND Δ>+1pp. (Per small-sample lessons, N<3000 is untrustworthy.)
- Watch iteration rate: tree iterations are more expensive (descent + node alloc). On WASM the iter cap is `time_ms×3`; tree iters cost more, so effective search depth per ms drops. Compare at EQUAL wall-time-equivalent, i.e. just run both at the same `time_ms` and accept fewer-but-deeper iterations for the tree.

### Phase 3 — tune + ship
- If positive: tune D (tree depth), c (exploration), expansion policy (expand-all-legal vs expand-one).
- Confirm at 300ms (browser budget) — the gain must survive at production budget.
- Ship: flip `BQ_TREE` default ON in WASM, rebuild both targets, document as **Hard-5** (finally earned if Δ≥+2pp), bump `AIPersonality` only if we want a separate lobby entry (or silently upgrade hard-4).

---

## Risks / failure modes

1. **Tree iterations too expensive** → fewer iterations at fixed budget → net wash or regression. Mitigation: depth-limit aggressively (D=5), reuse `sim` state cloning carefully, avoid HashMap churn (consider Vec-indexed children).
2. **Availability-count bug** → silent strength loss that looks like "tree doesn't help." Mitigation: the availability sanity test in Phase 1; cross-check against a known SO-ISMCTS reference trace.
3. **Mixed-player value signing** → if we later add minimax signing and get it wrong, opponents play to help us. v1 deliberately avoids this (all-maximize simplification).
4. **Memory** → 240 iters × branching ~6 × depth 5 ≈ bounded; fine. At 300ms/900 iters still fine. Only worry if we remove depth limit.

---

## Concrete first commit

`rust/crates/bq-ai/src/tree_ismcts.rs` (new file):
- `pub fn tree_ismcts_play(state, belief, rng, params) -> Card`
- `struct Node` + descent/expand/backprop helpers
- `#[cfg(test)] mod tests` with the 4 Phase-1 tests

Wire into `hard4.rs::hard4_play`: `if tree_enabled() { tree_ismcts_play(...) } else { ismcts_play(...) }`, default off.

Then Phase 2 harness + A/B before any default flip.

---

## Honest expectation

This is the highest-probability Hard-5, but it is NOT guaranteed. SO-ISMCTS sometimes fails to beat well-tuned flat MCTS in games where rollouts are already informative. Black Queen's greedy rollout is decent, so the tree must add real lookahead value to win. Budget 2-3 focused sessions; gate hard on the N≥5000 Z>2 bar; do not ship a marginal result as "Hard-5" (the lesson of this session).
