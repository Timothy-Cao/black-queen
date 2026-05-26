// Round-robin tournament: NEW tuned vs prior gens & baselines.
// Each match: mixed seats. Per-personality win-rate from each player's POV.
//
//   "hard-3" → loads ./tuned_weights.json (current candidate)
//   "hard-v1"    → loads ./tuned_weights_v1.json   (prior generation)
//   "hard"       → DEFAULT_HARD_WEIGHTS
//   "normal", "random" → other personalities
//
// We piggyback on the active weight slot: between every move, set the active
// weights to whatever the player at toPlay needs. Since AI dispatch happens
// turn-by-turn, this works.

import { existsSync, readFileSync } from "fs";
import { freshGame, applyBid, applyPass, applyDeclare, applyPlay, collectTrick } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { legalPlays } from "./rules";
import { AIPersonality, PlayerId } from "./types";
import { DEFAULT_HARD_WEIGHTS, HardWeights, setActiveHardWeights } from "./aiHard";

type ContestantKey = "v2" | "v1" | "hard" | "normal" | "random";

function loadWeights(path: string): HardWeights | null {
  if (!existsSync(path)) return null;
  try { return { ...DEFAULT_HARD_WEIGHTS, ...JSON.parse(readFileSync(path, "utf8")) }; }
  catch { return null; }
}

const W_V2 = loadWeights("./tuned_weights.json");
const W_V1 = loadWeights("./tuned_weights_v1.json");
if (!W_V2) throw new Error("Missing tuned_weights.json");
if (!W_V1) console.warn("Missing tuned_weights_v1.json; v1 contests will skip");

// Map each contestant to (personality used in dispatcher, weights to install).
const CONTESTANT: Record<ContestantKey, { p: AIPersonality; w?: HardWeights }> = {
  v2:     { p: "hard-3", w: W_V2 },
  v1:     { p: "hard-3", w: W_V1 ?? undefined },
  hard:   { p: "hard" },
  normal: { p: "normal" },
  random: { p: "random" },
};

function mulberry32(a: number) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function runOne(seats: ContestantKey[], seed: number): boolean[] {
  Math.random = mulberry32(seed);
  // Translate seats to AIPersonality config.
  let s = freshGame(seats.map((k, i) => ({ name: `P${i}`, isAI: true, aiPersonality: CONTESTANT[k].p })), 300);
  let safety = 0;
  const setForPlayer = (pid: PlayerId) => {
    const w = CONTESTANT[seats[pid]].w;
    if (w) setActiveHardWeights(w);
  };
  while (s.phase !== "game_end") {
    if (safety++ > 100000) throw new Error("stuck");
    const r = s.round;
    if (r.phase === "bidding") {
      const p = r.bidTurn!;
      setForPlayer(p);
      const d = aiBidDecision(s, p);
      s = d.bid === "pass" ? applyPass(s, p) : applyBid(s, p, d.bid);
    } else if (r.phase === "declaring") {
      setForPlayer(r.bidder!);
      const d = aiDeclareDecision(s, r.bidder!);
      s = applyDeclare(s, d.trump, d.partnerCard);
    } else if (r.phase === "playing") {
      if (r.pendingTrickComplete) s = collectTrick(s);
      else {
        const p = s.round.toPlay;
        setForPlayer(p);
        const card = aiPlayDecision(s, p);
        const legal = legalPlays(s.round.hands[p], s.round.currentTrick);
        if (!legal.some((c) => c.id === card.id)) throw new Error("illegal");
        s = applyPlay(s, p, card);
      }
    } else throw new Error("phase " + r.phase);
  }
  const r = s.round;
  const team = new Set<PlayerId>([r.bidder!, ...(r.partners ?? [])]);
  const teamCap = ([0,1,2,3,4] as PlayerId[]).filter(p => team.has(p)).reduce<number>((a, p) => a + (r.roundPoints?.[p] ?? 0), 0);
  const made = teamCap >= (r.winningBid ?? 0);
  return ([0,1,2,3,4] as PlayerId[]).map(p => made ? team.has(p) : !team.has(p));
}

interface MatchupStats { games: number; winsA: number; seatsA: number; winsB: number; seatsB: number; }

function head2head(A: ContestantKey, B: ContestantKey, N: number, seedBase: number): MatchupStats {
  const m: MatchupStats = { games: 0, winsA: 0, seatsA: 0, winsB: 0, seatsB: 0 };
  for (let i = 0; i < N; i++) {
    const rnd = mulberry32(seedBase + i * 1009);
    const seats: ContestantKey[] = [];
    for (let k = 0; k < 5; k++) seats.push(rnd() < 0.5 ? A : B);
    if (!seats.includes(A)) seats[Math.floor(rnd() * 5)] = A;
    if (!seats.includes(B)) seats[Math.floor(rnd() * 5)] = B;
    try {
      const w = runOne(seats, seedBase + i * 7919);
      m.games++;
      for (let k = 0; k < 5; k++) {
        if (seats[k] === A) { m.seatsA++; if (w[k]) m.winsA++; }
        else                { m.seatsB++; if (w[k]) m.winsB++; }
      }
      // Mirror swap
      const mirror = seats.map(k => k === A ? B : A) as ContestantKey[];
      const wM = runOne(mirror, seedBase + i * 7919);
      for (let k = 0; k < 5; k++) {
        if (mirror[k] === A) { m.seatsA++; if (wM[k]) m.winsA++; }
        else                 { m.seatsB++; if (wM[k]) m.winsB++; }
      }
    } catch { /* skip illegals */ }
  }
  return m;
}

const N = parseInt(process.argv[2] || "2000", 10);
const matchups: [ContestantKey, ContestantKey][] = [
  ["v2", "v1"],
  ["v2", "hard"],
  ["v2", "normal"],
  ["v1", "hard"],
  ["hard", "normal"],
];

console.log(`Tournament — ${N} game pairs (each ×2 mirror), per-seat win rates:`);
console.log("matchup           | A win-rate | B win-rate | A edge (pp)");
console.log("-".repeat(64));
for (const [A, B] of matchups) {
  if ((A === "v1" || B === "v1") && !W_V1) continue;
  const m = head2head(A, B, N, 9_000_000 + A.charCodeAt(0) * 17 + B.charCodeAt(0));
  const aR = m.winsA / m.seatsA, bR = m.winsB / m.seatsB;
  console.log(
    `${(A + " vs " + B).padEnd(17)} | ${(aR*100).toFixed(2).padStart(9)}% | ${(bR*100).toFixed(2).padStart(9)}% | ${((aR-bR)*100).toFixed(2).padStart(7)}pp`,
  );
}
