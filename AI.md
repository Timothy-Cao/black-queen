# How the strongest AIs were built

Black Queen is a 5-player trick-taking game with hidden partnerships, bidding, trump, and 300 card-points in the deck. Four AI generations live in production. Hard, Hard-2, and Hard-3 use a tuned utility function. Hard-4 uses Information-Set Monte Carlo Tree Search with a belief tracker, implemented in Rust and shipped to the browser through WebAssembly.

## Hard through Hard-3: tuned utility play

The first three hard AIs share the same basic design: score every legal action, choose the best-scoring action, and tune the scalar weights by simulation.

### What the utility function scores

Each move is scored as expected team points captured minus card spend cost, plus situational features:

- smear high-point cards onto tricks a known ally is winning
- avoid feeding points to known enemies
- special handling for Q♠, including commit and dump thresholds
- void-creation rewards when shedding a near-empty suit
- bid and declare strength from trump length, top cards, voids, point cards, and partner-card quality

Hard is the locked baseline. Hard-2 is the first evolutionary tuning pass. Hard-3 adds alliance inference and void-creation features, then retunes the weight set.

### How tuning works

The tuner uses a `(1+λ)` Evolution Strategy. Each generation mutates the current best weight vector, evaluates candidates through seeded games, and promotes only candidates that improve on fresh checks. Mirror replay is used whenever the expected edge is small: each seed is played twice, with the AIs swapped across seats, so seat order and deal variance mostly cancel out.

Single-opponent tuning was abandoned because it overfit. Candidates that trained only against Hard learned Hard's quirks and failed against prior tuned generations. The current promotion discipline uses multi-opponent fitness plus a non-regression gate.

### Team inference

Black Queen's partner card makes every play a possible signal. Hard-3 tracks a probability that each unknown player is on the caller's team. Voluntary point-feeds are evidence, forced plays are not. Once confidence crosses a threshold, the player is treated as an inferred ally or enemy and the normal smear/feed gates apply.

## Hard-4: search over hidden information

Hard-4 changed the representation. Instead of a one-ply utility score, it samples plausible worlds and searches through them.

### Belief state

The belief tracker records what each opponent can still hold. It uses hard constraints from the public game history:

- played cards are gone
- a player who failed to follow suit is void in that suit
- the declared partner card cannot be in impossible hands
- every sampled hand must preserve the remaining hand sizes

### Information-Set MCTS

For each move, Hard-4 repeatedly samples a determinization: one complete assignment of unseen cards that fits the belief state. It then runs a UCB-guided rollout from the current position, using a tactical policy rather than random play. The rollout values the whole team's captured points, not just the searching player's pile.

That team-aware backpropagation was a structural fix. In a partnership game, a trick lost to your partner can be good.

### Opponent-intent inference

Hard-4 also maintains a log-likelihood ratio for each unknown player's team alignment. The tracker updates from voluntary signals such as point-feeds, Q♠ feeds, withholds, trumping a caller-winning trick, or stealing points from the opposing team. These signals bias the determinization sampler toward worlds where the partner card is in a likely ally's hand.

This was the decisive lever. With intent inference off, Hard-4 is roughly tied with Hard-3. With it on, Hard-4 is the strongest AI in the lineup.

### Discard guards

Qualitative trace review found a repeatable mistake: hard AIs sometimes dumped a non-trump point card onto a trick a known enemy was already winning, even when a cheaper non-trump discard was legal. Hard-4 now has a narrow Rust-side post-search guard for that case. Hard, Hard-2, and Hard-3 have the matching TypeScript guard.

This is a small cleanup, not a new generation. The TS guard matrix showed +0.30pp to +0.66pp against Normal, with no meaningful ordering change inside the hard family.

## Current strength

The primary strength numbers come from mirror-replay paired evaluation on light shuffle:

| Matchup | Edge | Sample |
|---|---:|---|
| Hard-4 vs Hard-3 | +3.92pp | 500 mirror pairs |
| Hard-4 vs Hard-2 | +3.80pp | 300 mirror pairs |
| Hard-4 vs Hard | +5.32pp | 500 mirror pairs |
| Hard-4 vs Normal | +7.20pp | 200 mirror pairs |
| Hard-3 vs Hard | +4.5pp to +6pp | reference matrix |
| Hard-3 vs Normal | about +15.7pp | reference matrix |

Hard-4 is strongest overall. Hard-3 still has the largest measured edge over Normal in some older utility-only matrices, but Hard-4 wins the direct head-to-heads against prior hard generations.

## What did not work

- Single-opponent ES tuning overfit to the opponent. Multi-opponent fitness replaced it.
- Soft alliance-probability scaling regressed because the scoring weights were calibrated for binary ally/enemy gates.
- Multi-hop inference propagation moved only +0.06pp and remains off by default.
- The minimax endgame solver regressed by about 1pp. It assumed perfect opponents, while the real opponents are heuristic.
- The soft bid-strength belief prior regressed by about 3pp at default magnitudes. The direction may be useful, but the strength needs tuning.
- ES tuning of Hard-4 intent weights verified at −0.20pp on fresh seeds. The current intent magnitudes appear near a plateau for this representation.
- Threshold-based rollout value, `P(team makes bid)`, sounded theoretically right but lost the smoother action signal supplied by captured-points EV.
- Partner-aware and archetype-aware bidding heuristics landed at noise. A real search-based bidder is the better path.

## How to measure changes

Use the variance-canceling harness for small edges:

```bash
npx tsx src/game/_mirror_arena.ts 500 hard-4 hard-3
```

Use the deterministic matrix harness for same-seed one-vs-four checks:

```bash
HARD4_TIME_MS=80 npx tsx src/game/_matrix.ts 300 hard,hard-2,hard-3,hard-4,normal
BQ_TS_DISCARD_GUARD_OFF=1 HARD4_TIME_MS=80 npx tsx src/game/_matrix.ts 1000 hard,hard-2,hard-3,normal
```

Use the smoke test after any AI change:

```bash
npx tsx src/game/smoketest.ts
```

The main rule: do not trust a small edge from a regular random-seat arena. Under about 5pp, use mirror replay or a paired A/B harness.

## Best next directions

The next likely gains are architectural:

- tree-structured ISMCTS, so deeper decisions accumulate statistics instead of only root moves
- search-based bidding and declaring, since Hard-4 still delegates both to Hard-3
- ISMCTS-in-endgame, replacing the failed minimax solver with the same opponent model used elsewhere
- better rollout policy or learned belief features, once there is a stable evaluation harness for them

More small heuristic patches are lower priority unless trace review shows a clear, repeatable mistake.
