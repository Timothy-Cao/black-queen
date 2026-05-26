# Black Queen

A 5-player trick-taking card game with hidden partnerships and bidding. One round per game: bid, declare trump + a hidden partner card, play 13 rounds, settle the score.

Built as a polished single-page app with three tunable AI personalities. The strongest (Hard-3) wins ~61% of seats against the basic bot and ~57% against the rule-based baseline, trained by evolutionary search over millions of simulated games.

→ **Play it: [black-queen on Vercel](https://black-queen.vercel.app/)** (or run locally — see below)

## Quick play

- 5 players, 65 cards (two decks minus 2/3/4/6, only one 7♠), 300 points in the deck (Q♠ = 30, A = 15, 10 = 10, 5 = 5).
- One player wins the bid (150–300), picks trump, and names a *partner card* by rank+suit. Whoever holds it is on their team — but their identity stays hidden until they play that card.
- Caller + partners must capture ≥ bid in card points; if they make it both score the bid, if they fall short both lose it.
- The whole game in-app: hit `?` (bottom-right in the lobby, or the gear menu in-game) for the full rules.

## Run it locally

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production bundle in dist/
```

No backend, no API calls, no analytics — everything runs in the browser.

## The AI

Three selectable AI personalities, in increasing strength:

| Personality | Lobby label | What it does |
|---|---|---|
| `hard`   | Hard   | Locked rule-based baseline (gen 1) — hand-crafted utility scoring with ~50 scalars |
| `hard-2` | Hard-2 | First evolutionary tuning of those weights (gen 2) |
| `hard-3` | Hard-3 | Adds Bayesian-style alliance inference + void-creation discard scoring (gen 3) |

Plus `normal` (greedy +5 bidder) and `random` for variety.

**Strength on fresh seeds** (2500 game pairs × mirror replay):
- Hard-3 vs Normal: **+15.45 pp** · vs Hard: **+6.21 pp** · vs Hard-2: +0.21 pp
- Hard-2 vs Hard: **+3.34 pp**

**Read more**
- [`AI.md`](AI.md) — concise elevator pitch (resume-style)
- In-app: `?` → *"Read the mini-paper →"* opens the full AI Info page with matchup matrix, techniques per generation, and what we tried that didn't work
- [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) — repo conventions, AI generation pipeline, what to avoid re-attempting

## CLI tooling for AI work

All headless, no UI. From the repo root:

```bash
# Headless N-game arena across personality mixes
npx tsx src/game/arena.ts 2000 hard-3,hard

# Head-to-head tournament matrix
npx tsx src/game/_tournament.ts 3000

# Evolutionary tuning (single-opponent — opponent-overfit prone)
npx tsx src/game/tune.ts 80 12 80

# Multi-opponent tuning (recommended — fits vs Hard AND prior tuned gen)
npx tsx src/game/tune2.ts 80 12 120

# Smoketest (asserts every AI play is legal)
npx tsx src/game/smoketest.ts
```

Throughput is ~2,000–3,500 games/sec on a modern laptop.

## Layout

```
src/
  App.tsx, main.tsx     # top-level state machine + AI driver
  components/           # all React UI (Lobby, PlayerSeat, HandStrip, …)
  game/
    engine.ts           # pure reducer (applyBid / applyPlay / collectTrick / …)
    rules.ts            # legalPlays, trickWinner
    deck.ts             # 65-card deck + light/full shuffle
    types.ts            # all shared types
    ai.ts               # personality dispatcher
    aiHard.ts           # rule-based + scored AI; HardWeights interface
    tuned_weights_genN.json   # imported by main.tsx into the right weight slot

    # CLI-only sim tools (excluded from the app build):
    arena.ts, tune.ts, tune2.ts, smoketest.ts, _tournament.ts, _ab_*.ts
```

See [`CLAUDE.md`](CLAUDE.md) for the full layout and detailed conventions.

## Stack

Vite 8 · React 19 · TypeScript · Tailwind v3 · pure-reducer game engine · Web Audio API for SFX (no external assets).

---

Built by [@Timothy-Cao](https://github.com/Timothy-Cao). MIT license.
