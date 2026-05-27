# Mixed hard-AI observation pass

Date: 2026-05-27

## What changed

Added `src/game/_observe_games.ts`, a true TypeScript observer that runs games
through the production AI dispatcher:

- `hard` -> locked TS baseline
- `hard-2` -> gen-2 tuned weights
- `hard-3` -> gen-3 tuned weights
- `hard-4` -> Rust/WASM play, Hard-3 bid/declare delegation

This replaces the Rust `dump_game` tool for mixed-AI review. `dump_game` is still
useful for all-Hard-4 traces, but its mixed labels are only budget-scaled Hard-4,
not the actual TS personalities.

Command used:

```bash
HARD4_TIME_MS=80 npx tsx src/game/_observe_games.ts 4 53001 hard,hard-2,hard-3,hard-4 docs/game_traces
HARD4_TIME_MS=80 npx tsx src/game/_observe_games.ts 4 88001 hard,hard-2,hard-3,hard-4 docs/game_traces
```

## Manual read

The automatic `FLAG point discard` markers are intentionally broad. Most of the
early flags were not mistakes: the player was secretly on the caller team and
was correctly smearing points onto a caller-winning trick. Examples:

- `53001`: P1/P2 point discards onto P4's heart run are partner smears.
- `68839`: P1 dumping aces onto P4's spade run is partner smearing, not feeding.
- `95920`: P0 playing Q♠ onto P1's club trick is the called-card reveal and a
  correct +30 smear.

The clear mistake class that survived manual review was narrower:

> A TS hard-family AI can know the current trick winner is an enemy and still
> discard a point card when a cheaper non-trump discard is legal.

Concrete example:

- `111758`, Trick 6, P4 `hard-2`: P4 is a revealed partner of caller P0. P2 is
  an enemy and is currently winning with A♣. P4 discards 10♠ even though 8♠,
  9♠, K♠, Q♦, 9♦, and 8♦ are legal lower-point non-trump discards.

## Fix shipped

Added `avoidKnownEnemyPointDump()` in `src/game/ai.ts` for `hard`, `hard-2`,
and `hard-3`.

Scope:

- Only runs after the hard-family AI has selected a card.
- Only fires on non-trump point-card discards.
- Only fires when `knownCallerTeam()` gives exact team knowledge and the current
  trick winner is known enemy.
- Picks a strictly cheaper legal non-trump discard.
- Avoids revealing the partner card solely because it is cheap.
- Does not touch Hard-4; Hard-4 already has the Rust-side guard.

Rerun check:

```bash
HARD4_TIME_MS=80 npx tsx src/game/_observe_games.ts 1 111758 hard,hard-2,hard-3,hard-4 docs/game_traces_after_guard
```

In the same seed, P4 now discards 8♠ instead of 10♠ on Trick 6. The game still
fails because the caller team is far short of the 245 bid, but the local
tactical leak is removed.

## No patch yet

I did not patch bidding from this pass. Several games had aggressive bids fail,
but previous Hard-5 bidding experiments already showed that simple closed-form
bid tweaks are near the noise floor. A search-based bidder is still the right
direction if bidding becomes the target.

I also did not patch speculative future-smear behavior. Some partners could
possibly infer that a later teammate will win a trick and smear earlier, but the
examples are not clean enough yet. That needs more traces with post-hoc team
annotations before changing policy.
