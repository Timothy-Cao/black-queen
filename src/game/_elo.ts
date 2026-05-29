// Bot Elo ladder via Bradley-Terry on mixed-table self-play.
//
// Black Queen is 5-player with hidden teams (caller + partners vs defenders),
// so plain Elo (a 2-player model) doesn't directly apply. We use Bradley-Terry
// — the pairwise model Elo is built on:
//   1. Play N games with RANDOM personality assignment to the 5 seats.
//   2. One team wins each game (caller team makes the bid, or defenders break it).
//   3. Credit each winning-team bot a pairwise win over each losing-team bot
//      (skip same-personality cross-team pairs — uninformative).
//   4. Fit Bradley-Terry strengths (MM algorithm), convert to the Elo scale.
//
// This reflects true playing strength INCLUDING bidding judgment: a bot that
// over-calls and fails simply loses those games.
//
// Usage: HARD4_TIME_MS=80 npx tsx src/game/_elo.ts 3000 docs/elo/elo.json

import { mkdirSync, writeFileSync } from "fs";
import { applyBid, applyDeclare, applyPass, applyPlay, collectTrick, freshGame } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { AIPersonality, GameState, PlayerId, PLAYER_IDS } from "./types";
import { DEFAULT_HARD_WEIGHTS, HardWeights, setActiveHardWeights, setGen2HardWeights } from "./aiHard";
import { warmWasm } from "./hard4Driver";
import gen2Weights from "./tuned_weights_gen2.json";
import gen3Weights from "./tuned_weights_gen3.json";

setGen2HardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen2Weights } as HardWeights);
setActiveHardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen3Weights } as HardWeights);
await warmWasm();

const BOTS: AIPersonality[] = ["random", "normal", "hard", "hard-2", "hard-3", "hard-4"];
const IDX: Record<string, number> = Object.fromEntries(BOTS.map((b, i) => [b, i]));

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function withSeededRandom<T>(seed: number, fn: () => T): T {
  const old = Math.random; Math.random = mulberry32(seed);
  try { return fn(); } finally { Math.random = old; }
}

// Play one mixed game. Returns the caller-team set + whether they won, or null
// (e.g. all-random table → infinite redeal → safety trip).
function playGame(seats: AIPersonality[], seed: number): { winners: Set<PlayerId>; losers: Set<PlayerId> } | null {
  return withSeededRandom(seed, () => {
    let state: GameState = freshGame(
      seats.map((p, i) => ({ name: `P${i}`, isAI: true, aiPersonality: p })),
      300, "light", 0, false,
    );
    let safety = 0;
    while (state.phase !== "game_end") {
      if (safety++ > 8000) return null; // all-pass loop or stuck — skip
      const r = state.round;
      if (r.pendingTrickComplete) { state = collectTrick(state); continue; }
      if (r.phase === "bidding") {
        const p = r.bidTurn!;
        const d = aiBidDecision(state, p);
        state = d.bid === "pass" ? applyPass(state, p) : applyBid(state, p, d.bid);
      } else if (r.phase === "declaring") {
        const d = aiDeclareDecision(state, r.bidder!);
        state = applyDeclare(state, d.trump, d.partnerCard);
      } else if (r.phase === "playing") {
        const card = aiPlayDecision(state, r.toPlay);
        state = applyPlay(state, r.toPlay, card);
      } else return null;
    }
    const r = state.round;
    const caller = r.bidder;
    if (caller === undefined || caller === null) return null;
    const callerTeam = new Set<PlayerId>([caller as PlayerId, ...(r.partners ?? [])]);
    const teamPts = PLAYER_IDS.filter(p => callerTeam.has(p)).reduce((s, p) => s + (r.roundPoints?.[p] ?? 0), 0);
    const made = teamPts >= (r.winningBid ?? 0);
    const defenders = new Set<PlayerId>(PLAYER_IDS.filter(p => !callerTeam.has(p)));
    return made ? { winners: callerTeam, losers: defenders } : { winners: defenders, losers: callerTeam };
  });
}

// ---- run ----
const argv = process.argv;
const N = parseInt(argv[2] ?? "3000", 10);
const outPath = argv[3] ?? "docs/elo/elo.json";
mkdirSync(outPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });

const n = BOTS.length;
const wins: number[][] = Array.from({ length: n }, () => new Array(n).fill(0)); // wins[i][j] = i beat j
const gamesWonBy = new Array(n).fill(0);
const gamesPlayedBy = new Array(n).fill(0);
let played = 0, skipped = 0;
const t0 = Date.now();

for (let g = 0; g < N; g++) {
  const seed = 20_000_000 + g;
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const seats: AIPersonality[] = PLAYER_IDS.map(() => BOTS[Math.floor(rng() * n)]);
  const res = playGame(seats, seed);
  if (!res) { skipped++; continue; }
  played++;
  for (const p of PLAYER_IDS) gamesPlayedBy[IDX[seats[p]]]++;
  for (const w of res.winners) gamesWonBy[IDX[seats[w]]]++;
  // pairwise cross-team credit
  for (const w of res.winners) {
    for (const l of res.losers) {
      const iw = IDX[seats[w]], il = IDX[seats[l]];
      if (iw === il) continue; // same personality on opposite teams — uninformative
      wins[iw][il]++;
    }
  }
  if ((g + 1) % 250 === 0) {
    const el = (Date.now() - t0) / 1000;
    console.error(`progress: ${g + 1}/${N} games, ${el.toFixed(0)}s, ETA ${((N - g - 1) / ((g + 1) / el)).toFixed(0)}s`);
  }
}

// ---- Bradley-Terry MLE via MM algorithm ----
// p_i strength; P(i beats j) = p_i/(p_i+p_j). Iterate to convergence.
const p = new Array(n).fill(1);
const totalGames = (i: number, j: number) => wins[i][j] + wins[j][i];
for (let iter = 0; iter < 1000; iter++) {
  const next = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let num = 0, den = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      num += wins[i][j];
      const nij = totalGames(i, j);
      if (nij > 0) den += nij / (p[i] + p[j]);
    }
    next[i] = den > 0 ? num / den : p[i];
  }
  // normalize (geometric mean = 1) for stability
  const logmean = next.reduce((s, x) => s + Math.log(x || 1e-9), 0) / n;
  const gm = Math.exp(logmean);
  for (let i = 0; i < n; i++) p[i] = next[i] / gm;
}

// ---- convert BT strengths to Elo scale ----
// Elo difference = 400 * log10(p_i / p_j). Anchor so the weakest bot ~1000.
const SCALE = 400 / Math.log(10);
const rawElo = p.map((x) => SCALE * Math.log(x));
const minElo = Math.min(...rawElo);
const ANCHOR = 1000; // weakest bot floor
const elo = rawElo.map((e) => Math.round(e - minElo + ANCHOR));

// pairwise win-rate matrix for the report
const pairRate: Record<string, Record<string, number | null>> = {};
for (let i = 0; i < n; i++) {
  pairRate[BOTS[i]] = {};
  for (let j = 0; j < n; j++) {
    if (i === j) { pairRate[BOTS[i]][BOTS[j]] = null; continue; }
    const tot = totalGames(i, j);
    pairRate[BOTS[i]][BOTS[j]] = tot > 0 ? +(wins[i][j] / tot).toFixed(3) : null;
  }
}

const ladder = BOTS.map((b, i) => ({
  bot: b,
  elo: elo[i],
  perSeatWinRate: gamesPlayedBy[i] > 0 ? +(gamesWonBy[i] / gamesPlayedBy[i]).toFixed(3) : 0,
  gamesPlayed: gamesPlayedBy[i],
})).sort((a, b) => b.elo - a.elo);

const result = { generatedFromGames: played, skipped, hard4TimeMs: process.env.HARD4_TIME_MS ?? "default", ladder, pairwiseWinRate: pairRate };
writeFileSync(outPath, JSON.stringify(result, null, 2));

console.log("\n# Bot Elo ladder (Bradley-Terry, anchored weakest=1000)");
console.log(`games=${played}  skipped=${skipped}  HARD4_TIME_MS=${result.hard4TimeMs}\n`);
console.log("| bot | Elo | per-seat win% | games |");
console.log("|---|---:|---:|---:|");
for (const row of ladder) {
  console.log(`| ${row.bot} | ${row.elo} | ${(row.perSeatWinRate * 100).toFixed(1)}% | ${row.gamesPlayed} |`);
}
console.log(`\nwrote ${outPath}`);
