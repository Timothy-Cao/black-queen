// =============================================================================
//  Tuner v2 — multi-opponent ES.
//
//  Fitness = candidate's per-seat win rate vs a MIX of opponents (hard + v1)
//  minus the same opponents' average win rate, over paired-mirror eval.
//
//  Goals: prevent overfit to a single opponent and ensure new gens are
//  monotonically improving (don't regress on prior generations).
// =============================================================================

import { writeFileSync, readFileSync, existsSync } from "fs";
import { freshGame, applyBid, applyPass, applyDeclare, applyPlay, collectTrick } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { legalPlays } from "./rules";
import { AIPersonality, PlayerId } from "./types";
import { DEFAULT_HARD_WEIGHTS, HardWeights, setActiveHardWeights } from "./aiHard";

const GENERATIONS = parseInt(process.argv[2] || "80", 10);
const LAMBDA = parseInt(process.argv[3] || "12", 10);
const GAMES_PER_EVAL = parseInt(process.argv[4] || "120", 10);
const OUTFILE = "./tuned_weights.json";
const V1_FILE = "./tuned_weights_v1.json";

const INITIAL_SIGMA = 0.22;
const SIGMA_MIN = 0.04;
const SIGMA_MAX = 0.45;
const SIGMA_GROW = 1.22;
const SIGMA_SHRINK = 1 / 1.22;

function loadWeights(p: string): HardWeights | null {
  if (!existsSync(p)) return null;
  try { return { ...DEFAULT_HARD_WEIGHTS, ...JSON.parse(readFileSync(p, "utf8")) }; }
  catch { return null; }
}

const W_V1 = loadWeights(V1_FILE);
if (!W_V1) throw new Error("Need " + V1_FILE);
const W_DEFAULT = { ...DEFAULT_HARD_WEIGHTS };

// Opponents the candidate must beat. Mix in equal proportions.
type OppKey = "hard" | "v1";
const OPP_WEIGHTS: Record<OppKey, HardWeights> = { hard: W_DEFAULT, v1: W_V1 };

function mulberry32(a: number) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function boxMuller(rnd: () => number): number {
  const u1 = Math.max(rnd(), 1e-9); const u2 = rnd();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

type Slot = "cand" | "hard" | "v1";

/** Run one game where each seat is one of: candidate, hard, or v1.
 *  Returns per-seat win flag. */
function playOne(seats: Slot[], candidate: HardWeights, seed: number): boolean[] {
  Math.random = mulberry32(seed);
  // All seats use "hard-2" personality; we hot-swap activeHardWeights per move.
  const personalities: AIPersonality[] = seats.map(() => "hard-2");
  let s = freshGame(personalities.map((p, i) => ({ name: `P${i}`, isAI: true, aiPersonality: p })), 300);
  const setFor = (pid: PlayerId) => {
    const slot = seats[pid];
    setActiveHardWeights(slot === "cand" ? candidate : (slot === "v1" ? W_V1! : W_DEFAULT));
  };
  let safety = 0;
  while (s.phase !== "game_end") {
    if (safety++ > 100000) throw new Error("stuck");
    const r = s.round;
    if (r.phase === "bidding") {
      const p = r.bidTurn!;
      setFor(p);
      const d = aiBidDecision(s, p);
      s = d.bid === "pass" ? applyPass(s, p) : applyBid(s, p, d.bid);
    } else if (r.phase === "declaring") {
      setFor(r.bidder!);
      const d = aiDeclareDecision(s, r.bidder!);
      s = applyDeclare(s, d.trump, d.partnerCard);
    } else if (r.phase === "playing") {
      if (r.pendingTrickComplete) s = collectTrick(s);
      else {
        const p = s.round.toPlay;
        setFor(p);
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

/** Fitness: candidate per-seat win-rate minus opponent per-seat win-rate, averaged across two opponent mixes. */
function evaluate(cand: HardWeights, n: number, seedBase: number): { fitness: number; vsHard: number; vsV1: number } {
  let candW = 0, candS = 0;
  let oppHardW = 0, oppHardS = 0;
  let oppV1W = 0, oppV1S = 0;
  for (let i = 0; i < n; i++) {
    const rnd = mulberry32(seedBase + i * 1009);
    // Pick opponent type for this game: hard or v1 (each half).
    const oppKey: OppKey = i % 2 === 0 ? "hard" : "v1";
    const seats: Slot[] = [];
    for (let k = 0; k < 5; k++) seats.push(rnd() < 0.5 ? "cand" : (oppKey as Slot));
    if (!seats.includes("cand")) seats[Math.floor(rnd()*5)] = "cand";
    if (!seats.includes(oppKey as Slot)) seats[Math.floor(rnd()*5)] = oppKey as Slot;
    try {
      const w = playOne(seats, cand, seedBase + i * 7919);
      for (let k = 0; k < 5; k++) {
        if (seats[k] === "cand") { candS++; if (w[k]) candW++; }
        else if (seats[k] === "hard") { oppHardS++; if (w[k]) oppHardW++; }
        else if (seats[k] === "v1")   { oppV1S++; if (w[k]) oppV1W++; }
      }
      // Mirror: swap cand <-> opp
      const mirror = seats.map(s => s === "cand" ? (oppKey as Slot) : (s === (oppKey as Slot) ? "cand" : s)) as Slot[];
      const wM = playOne(mirror, cand, seedBase + i * 7919);
      for (let k = 0; k < 5; k++) {
        if (mirror[k] === "cand") { candS++; if (wM[k]) candW++; }
        else if (mirror[k] === "hard") { oppHardS++; if (wM[k]) oppHardW++; }
        else if (mirror[k] === "v1")   { oppV1S++; if (wM[k]) oppV1W++; }
      }
    } catch { /* skip */ }
  }
  const candR = candS ? candW / candS : 0;
  const hardR = oppHardS ? oppHardW / oppHardS : 0;
  const v1R = oppV1S ? oppV1W / oppV1S : 0;
  const oppR = (hardR + v1R) / 2;
  // Fitness encodes both edges. Center on 0.5 so 1/5-success rule works.
  const fitness = 0.5 + (candR - oppR) / 2;
  return { fitness, vsHard: candR - hardR, vsV1: candR - v1R };
}

function mutate(base: HardWeights, sigma: number, seed: number): HardWeights {
  const rnd = mulberry32(seed);
  const out: HardWeights = { ...base };
  for (const k of Object.keys(out) as (keyof HardWeights)[]) {
    const v = out[k] as number;
    const mag = Math.max(1, Math.abs(v));
    const delta = boxMuller(rnd) * sigma * mag;
    let nv = v + delta;
    if (k === "bidCap") nv = Math.max(180, Math.min(300, nv));
    else if (k === "bidCapExtraordinary") nv = Math.max(220, Math.min(310, nv));
    else if (k.startsWith("trumpProtected") || k.startsWith("trumpUnprotected") || k === "partnerPointHalfWeight" || k === "bidSelfCaptureFromPoints" || k === "bidSelfCaptureFromTrump" || k === "bidSelfCaptureFromTrumpScore" || k === "trumpSpendCostFactor" || k === "qSpadesCommitThreshold") {
      nv = Math.max(0, Math.min(1.5, nv));
    } else if (k === "voidCreateTrumpGate") {
      nv = Math.max(0.5, Math.min(3.0, nv));
    } else if (k === "inferSmearStrength") {
      nv = Math.max(0, Math.min(1.0, nv));
    } else if (k === "inferSmearThreshold") {
      nv = Math.max(5, Math.min(30, nv));
    } else {
      nv = Math.max(0, nv);
    }
    (out as any)[k] = nv;
  }
  return out;
}

console.log(`Multi-opponent ES — (1+${LAMBDA})  Generations=${GENERATIONS}  games/eval=${GAMES_PER_EVAL}`);
console.log(`Opponents: hard (DEFAULT), v1 (./tuned_weights_v1.json)`);

let best: HardWeights = { ...W_V1 };  // start from v1 (the proven baseline)
let sigma = INITIAL_SIGMA;
const t0 = Date.now();

const base0 = evaluate(best, GAMES_PER_EVAL * 2, 1_000_000);
console.log(`Gen 0 (v1 baseline): fitness=${(base0.fitness*100).toFixed(2)}%  vsHard=+${(base0.vsHard*100).toFixed(2)}pp  vsV1=${(base0.vsV1*100).toFixed(2)}pp`);
let bestFit = base0.fitness;

for (let gen = 1; gen <= GENERATIONS; gen++) {
  const offspring: { w: HardWeights; e: { fitness: number; vsHard: number; vsV1: number } }[] = [];
  let succ = 0;
  for (let k = 0; k < LAMBDA; k++) {
    const seed = gen * 31337 + k * 101 + 1;
    const cand = mutate(best, sigma, seed);
    const e = evaluate(cand, GAMES_PER_EVAL, gen * 1_000_003 + k * 17);
    offspring.push({ w: cand, e });
    if (e.fitness > bestFit) succ++;
  }
  offspring.sort((a, b) => b.e.fitness - a.e.fitness);
  const top = offspring[0];
  // Promotion gate: must improve fitness AND not regress vs v1 by more than -0.5pp.
  if (top.e.fitness > bestFit && top.e.vsV1 >= -0.005) {
    best = top.w;
    bestFit = top.e.fitness;
  }
  const sr = succ / LAMBDA;
  if (sr > 0.2) sigma = Math.min(SIGMA_MAX, sigma * SIGMA_GROW);
  else sigma = Math.max(SIGMA_MIN, sigma * SIGMA_SHRINK);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`Gen ${String(gen).padStart(3)}: best=${(bestFit*100).toFixed(2)}%  topfit=${(top.e.fitness*100).toFixed(2)}%  vsHard=${(top.e.vsHard*100).toFixed(2)}pp vsV1=${(top.e.vsV1*100).toFixed(2)}pp  σ=${sigma.toFixed(3)} succ=${succ}/${LAMBDA} t=${elapsed}s`);
  if (gen % 10 === 0) writeFileSync(OUTFILE, JSON.stringify({ ...best, __meta: { generation: gen, fitness: bestFit, mode: "multi-opp" } }, null, 2));
}

writeFileSync(OUTFILE, JSON.stringify({ ...best, __meta: { generation: GENERATIONS, fitness: bestFit, mode: "multi-opp" } }, null, 2));

const verify = evaluate(best, 2500, 9_876_543);
console.log(`\nVerification on fresh seeds (2500 game pairs × 2 mirror):`);
console.log(`  vs Hard: ${verify.vsHard >= 0 ? "+" : ""}${(verify.vsHard*100).toFixed(2)}pp`);
console.log(`  vs V1:   ${verify.vsV1 >= 0 ? "+" : ""}${(verify.vsV1*100).toFixed(2)}pp`);
console.log(`  combined fitness: ${(verify.fitness*100).toFixed(2)}%`);
console.log(`Saved best to ${OUTFILE}`);
