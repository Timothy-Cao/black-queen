# Watching Hard-4 play itself — qualitative mistakes

Three full games played at 80 ms/move, all five seats Hard-4, on light-shuffle deals (seeds 42, 7, 99). Full traces saved; this writeup is my reading of the plays a stronger AI would have chosen differently.

## TL;DR

**There is a clear, repeatable, high-impact bug class in Hard-4's discarding logic.** Across three games I counted **~12 plays** where Hard-4 chose a high-point card over an available zero-point alternative, conceding between 5 and 15 points each. Both teams make this mistake. It accounts for **20–70 lost points per game**, sometimes enough to swing the outcome.

The underlying cause is consistent: Hard-4's tactical rollout / value backprop doesn't price "card spend cost" correctly. Hard-3 had explicit weights (`spendAceCost`, `spendKingCost`, `spendQueenCost`) modeling the opportunity cost of spending a high card; Hard-4 doesn't have that, and at the search depth we can afford in the browser the rollouts can't recover the signal.

## The two error modes

### Error 1: Opponent dumps a point card when a zero-point alternative is available

The clearest signature. Once the player is out of the led suit and has to discard, Hard-4 sometimes picks a point card (A, 10, or 5) when a 0-point card (a low J, Q, or K of an irrelevant suit) is in hand.

Examples observed:
- **Game 2, Trick 3**: P0 had 11 cards to choose from including five non-point cards (♦8, ♦9, ♣9, ♦5, ♥5). Played **♦A** (15 pts) instead. Direct gift of 15 pts to the caller's team.
- **Game 2, Trick 3**: P1 had ten non-point alternatives. Played **♦A** anyway.
- **Game 2, Trick 8 + 9**: P4 had four 0-point clubs available. Played **♦T** (10 pts) on both. Cost 20 pts across the two tricks.
- **Game 2, Trick 12**: P0 had ♦9 (0 pts) available. Played **♣A** (15 pts).
- **Game 3, Trick 11 + 12**: P1 had ♣9 (0 pts) available. Played **♣T** (10 pts) on both.
- **Game 1, Trick 11**: P3 had ♦Q (0 pts) and ♦T (10 pts). Played **♦A** (15 pts) over both.

In every one of these the rule the AI seems to be missing is *"if I'm definitely discarding to a trick the other team will capture, play the lowest-point card available."* That is not a deep strategic insight; it is the textbook tactical default.

### Error 2: Caller-team fails to smear a high card before it dies as a forced discard

Symmetric mistake. The caller's team holds a 15-point Ace in a suit that has been exhausted (no more tricks of that suit will be led). The Ace will eventually be a forced discard at trick 13 and capture zero points. The optimal move is to **smear it onto a caller-winning trick now** for +15 to the team. Hard-4 instead keeps it back and ends up wasting it.

Examples:
- **Game 3, Trick 10**: P0 (caller's partner) holds ♥A as their only heart, plus two ♣5/♣8. P0 discards ♣5 to a caller-winning ♠5 trick. The ♥A should have been smeared for +15. The ♥A in fact dies as a forced discard in trick 13.
- **Game 3, Tricks 11, 12**: Same situation, same mistake, two more chances missed. Final score: 240 vs the 210 bid. Could easily have been 255 with correct play, no risk.

Hard-3's weight `qSpadesCommitBonus` already encodes this idea ("commit a high-value card to a trick the team will win"). Hard-4 doesn't have the equivalent.

## Why does this happen in Hard-4?

The ISMCTS rollout uses a tactical policy that handles the obvious cases (don't ruff a teammate's trick, smear when ally is clearly winning, etc.) but the *discard* sub-policy looks light. From the trace I infer the policy is something close to:

> *"If I can't follow suit and don't want to trump, pick a discard from my hand."*

without the qualifier *"specifically the lowest-point one consistent with future hand strength."*

In a 13-move game with ~5 legal moves per node and 100–300 search iterations per move, the search alone can't always identify which discard is right — the value backprop rewards the eventual trick outcome but not the per-card spend cost, so two discards that lead to the same final score look equivalent even though one wastes a 15-point card and the other doesn't.

## Estimated impact if fixed

Counting only the high-confidence mistakes across the three games:

| Game | Caller bid | Caller made | Opponent mistakes (pts to caller) | Caller-team mistakes (smear missed) |
|---|---|---|---|---|
| 1 | 225 | 285 | 30 (P3 twice, P2 once) | 0 |
| 2 | 185 | 300 | 55 (P0 twice, P1, P4 thrice) | 0 |
| 3 | 210 | 240 | 35 (P1 thrice, P3 once) | 45 (P0 missed three smears) |

Even in these blowouts, fixing the discard logic would have:
- Cut the caller's margin in Games 1 and 2 (no outcome change but better game shape)
- Likely failed the caller's bid in **closer games** where the bid is sitting right at the edge of make/fail — this is where the 30–70 lost points really matter

I'd estimate **~+1 to +3 pp net edge** for the AI if this single fix shipped cleanly. That's bigger than every Hard-5 experiment we ran.

## What the fix could look like

Three options, in order of effort:

1. **Add an explicit discard-ordering subroutine** that runs BEFORE the ISMCTS search returns its move: if the search's chosen card is a non-trump discard and there exists a legal alternative with strictly lower point value AND same suit category, swap to the lower-point card. Cheap to implement; preserves the search's strategic choice in every other case.

2. **Bias the rollout policy** to spend the lowest-point legal card when the rollout doesn't intend to win the trick. Same idea but inside the rollout instead of post-search. Slightly heavier, slightly more correct in expectation.

3. **Add `spend_cost` to the value backprop**: penalize the rollout score by the point-value of the AI's own card play when not winning the trick. Most general fix; would also pick up the "smear before it dies" symmetric case automatically if scoped over all cards.

I'd start with #1 because it's testable in 30 minutes, easy to A/B isolate, and addresses the most common error mode. If it shows a real edge, #3 is the principled follow-up.

## What we didn't see

A few things I was watching for that I did NOT find:
- Bad bid decisions (the bids in all three games looked reasonable for the hands)
- Wrong trump or partner-card declarations (also reasonable)
- Wrong trick-winning choices when the AI had a winning option (it took the winning move every time)
- Bad lead choices after winning a trick (mostly fine; some marginal could-be-better picks)

The mistakes are concentrated in **discards under pressure**. Everything else looks OK at this search depth.
