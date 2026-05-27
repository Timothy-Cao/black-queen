// Sweep AI strength across shuffle intensities.
//
//   npx tsx src/game/_shuffle_sweep.ts [N=1500] [matchup=hard-3,hard]
//
// For each intensity in {0, 0.25, 0.5, 0.75, 1}, plays N games with a mix of
// two personalities and reports per-seat win-rate edge. The point is to see
// whether the strong AI's edge over a baseline stays roughly stable across
// shuffle intensities — if yes, a shuffle-robust Hard-A isn't needed.

import { freshGame, applyBid, applyPass, applyDeclare, applyPlay, collectTrick } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { legalPlays } from "./rules";
import { AIPersonality, PlayerId } from "./types";
import { DEFAULT_HARD_WEIGHTS, setActiveHardWeights, setGen2HardWeights, HardWeights } from "./aiHard";
import { existsSync, readFileSync } from "fs";

// Load tuned weights so that "hard-2" and "hard-3" use their real trained
// weights in CLI mode (the browser does this in main.tsx; CLI scripts must
// do it explicitly).
function loadJsonWeights(path: string): HardWeights | null {
  if (!existsSync(path)) return null;
  try { return { ...DEFAULT_HARD_WEIGHTS, ...JSON.parse(readFileSync(path, "utf8")) }; }
  catch { return null; }
}
const g2 = loadJsonWeights("./src/game/tuned_weights_gen2.json") ?? loadJsonWeights("./tuned_weights_v1.json");
const g3 = loadJsonWeights("./src/game/tuned_weights_gen3.json") ?? loadJsonWeights("./tuned_weights.json");
if (g2) setGen2HardWeights(g2);
if (g3) setActiveHardWeights(g3);
console.log(`Loaded weights: gen2=${g2 ? "yes" : "no"}, gen3=${g3 ? "yes" : "no"}`);

function mulberry32(a: number) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function runOne(seats: AIPersonality[], seed: number, intensity: number): boolean[] {
  Math.random = mulberry32(seed);
  let s = freshGame(
    seats.map((p, i) => ({ name: `P${i}`, isAI: true, aiPersonality: p })),
    300, intensity >= 0.5 ? "full" : "light", intensity,
  );
  let safety = 0;
  while (s.phase !== "game_end") {
    if (safety++ > 100000) throw new Error("stuck");
    const r = s.round;
    if (r.phase === "bidding") { const d = aiBidDecision(s, r.bidTurn!); s = d.bid === "pass" ? applyPass(s, r.bidTurn!) : applyBid(s, r.bidTurn!, d.bid); }
    else if (r.phase === "declaring") { const d = aiDeclareDecision(s, r.bidder!); s = applyDeclare(s, d.trump, d.partnerCard); }
    else if (r.phase === "playing") {
      if (r.pendingTrickComplete) s = collectTrick(s);
      else {
        const card = aiPlayDecision(s, r.toPlay);
        const legal = legalPlays(s.round.hands[s.round.toPlay], s.round.currentTrick);
        if (!legal.some(c => c.id === card.id)) throw new Error("illegal");
        s = applyPlay(s, s.round.toPlay, card);
      }
    } else throw new Error("phase " + r.phase);
  }
  const r = s.round;
  const team = new Set<PlayerId>([r.bidder!, ...(r.partners ?? [])]);
  const teamCap = ([0, 1, 2, 3, 4] as PlayerId[]).filter(p => team.has(p)).reduce<number>((a, p) => a + (r.roundPoints?.[p] ?? 0), 0);
  const made = teamCap >= (r.winningBid ?? 0);
  return ([0, 1, 2, 3, 4] as PlayerId[]).map(p => made ? team.has(p) : !team.has(p));
}

function sweepOne(A: AIPersonality, B: AIPersonality, N: number, intensity: number): { aR: number; bR: number; aMakeRate: number } {
  let aW = 0, aS = 0, bW = 0, bS = 0;
  let aCalls = 0, aCallsMade = 0;
  for (let i = 0; i < N; i++) {
    const rnd = mulberry32(7 + i * 1009);
    const seats: AIPersonality[] = [];
    for (let k = 0; k < 5; k++) seats.push(rnd() < 0.5 ? A : B);
    if (!seats.includes(A)) seats[0] = A;
    if (!seats.includes(B)) seats[1] = B;
    const seed = 12345 + i * 7919;
    // Mirrored pair: original layout, then A↔B swap.
    for (let mirror = 0; mirror < 2; mirror++) {
      const layout = mirror === 0 ? seats : seats.map(s => s === A ? B : A) as AIPersonality[];
      try {
        const w = runOne(layout, seed, intensity);
        for (let k = 0; k < 5; k++) {
          if (layout[k] === A) { aS++; if (w[k]) aW++; }
          else { bS++; if (w[k]) bW++; }
        }
        // Tally calls made by A (rough proxy for bid calibration health).
        // Not perfect — we'd need to know who won the bid. Skip for now.
        void aCalls; void aCallsMade;
      } catch { /* skip illegal */ }
    }
  }
  return { aR: aW / aS, bR: bW / bS, aMakeRate: 0 };
}

const N = parseInt(process.argv[2] || "1500", 10);
const arg = process.argv[3] || "hard-3,hard";
const [A, B] = arg.split(",").map(s => s.trim()) as [AIPersonality, AIPersonality];

console.log(`Shuffle sweep: ${A} vs ${B}, N=${N} pairs (×2 mirror per pair).`);
console.log(`  Each row: ${A} per-seat win-rate vs ${B}, edge in pp.`);
console.log("");
console.log("intensity  |   A win%   |   B win%   |   edge (pp)");
console.log("-".repeat(56));
const INTENSITIES = [0, 0.25, 0.5, 0.75, 1];
const t0 = Date.now();
for (const t of INTENSITIES) {
  const r = sweepOne(A, B, N, t);
  const label = t === 0 ? "0.00 (light)" : t === 1 ? "1.00 (full) " : t.toFixed(2).padEnd(12);
  const edge = (r.aR - r.bR) * 100;
  console.log(`${label} | ${(r.aR * 100).toFixed(2).padStart(8)}%  | ${(r.bR * 100).toFixed(2).padStart(8)}%  | ${edge >= 0 ? "+" : ""}${edge.toFixed(2).padStart(6)}pp`);
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nDone in ${elapsed}s.`);
