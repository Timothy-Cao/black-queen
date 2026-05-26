// =============================================================================
//  Evolutionary tuner for HardWeights
//
//  (1+λ)-ES with self-adaptive sigma (1/5-success rule). Each generation:
//    1. Sample λ offspring around the current best.
//    2. Each offspring plays N games as "hard-2" against locked-in "hard"
//       baselines. Half the time seated at random positions, half the time at
//       a mirrored layout to reduce seat bias.
//    3. Track the best-performing offspring. If it beats the current best,
//       promote it. Otherwise sigma shrinks slightly.
//
//  Save best weights to ./tuned_weights.json. Run:
//      npx tsx src/game/tune.ts             # default schedule
//      npx tsx src/game/tune.ts 80 12 80    # generations, lambda, games/eval
// =============================================================================

import { writeFileSync, readFileSync, existsSync } from "fs";
import { freshGame, applyBid, applyPass, applyDeclare, applyPlay, collectTrick } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { legalPlays } from "./rules";
import { AIPersonality, GameState, PlayerId } from "./types";
import { DEFAULT_HARD_WEIGHTS, HardWeights, setActiveHardWeights } from "./aiHard";

// -----------------------------------------------------------------------------
//  Hyperparameters of the search (separate from HardWeights)
// -----------------------------------------------------------------------------

const GENERATIONS = parseInt(process.argv[2] || "80", 10);
const LAMBDA = parseInt(process.argv[3] || "12", 10);
const GAMES_PER_EVAL = parseInt(process.argv[4] || "80", 10);
const OUTFILE = "./tuned_weights.json";

// Per-weight relative-mutation sigma (start). We perturb each weight by
// Gaussian noise scaled to its current magnitude.
const INITIAL_SIGMA = 0.18;
const SIGMA_MIN = 0.03;
const SIGMA_MAX = 0.45;
// 1/5-success rule constants (Schwefel): if hit-rate > 1/5, expand sigma;
// if lower, shrink. Applied after every generation.
const SIGMA_GROW = 1.22;
const SIGMA_SHRINK = 1 / 1.22;

// -----------------------------------------------------------------------------
//  Game runner — same as arena.ts but inlined and stripped to minimum
// -----------------------------------------------------------------------------

/** Run one game. Returns per-seat win flag (true = that seat ended on the winning side). */
function playOne(seats: AIPersonality[], seed: number): boolean[] {
  Math.random = mulberry32(seed);
  let s = freshGame(seats.map((p, i) => ({ name: `P${i}`, isAI: true, aiPersonality: p })), 300);
  let safety = 0;
  while (s.phase !== "game_end") {
    if (safety++ > 100000) throw new Error("Stuck game");
    const r = s.round;
    if (r.phase === "bidding") {
      const target = r.bidTurn!;
      const d = aiBidDecision(s, target);
      s = d.bid === "pass" ? applyPass(s, target) : applyBid(s, target, d.bid);
    } else if (r.phase === "declaring") {
      const d = aiDeclareDecision(s, r.bidder!);
      s = applyDeclare(s, d.trump, d.partnerCard);
    } else if (r.phase === "playing") {
      if (r.pendingTrickComplete) s = collectTrick(s);
      else {
        const card = aiPlayDecision(s, r.toPlay);
        const legal = legalPlays(s.round.hands[s.round.toPlay], s.round.currentTrick);
        if (!legal.some((c) => c.id === card.id)) {
          throw new Error(`Illegal play by ${seats[s.round.toPlay]}`);
        }
        s = applyPlay(s, s.round.toPlay, card);
      }
    } else throw new Error("Unhandled phase " + r.phase);
  }
  const r = s.round;
  const team = new Set<PlayerId>([r.bidder!, ...(r.partners ?? [])]);
  const teamCapture = ([0, 1, 2, 3, 4] as PlayerId[])
    .filter((p) => team.has(p))
    .reduce<number>((acc, p) => acc + (r.roundPoints?.[p] ?? 0), 0);
  const callerMade = teamCapture >= (r.winningBid ?? 0);
  const out: boolean[] = [];
  for (const p of [0, 1, 2, 3, 4] as PlayerId[]) {
    const onCallerTeam = team.has(p);
    out.push(callerMade ? onCallerTeam : !onCallerTeam);
  }
  return out;
}

function mulberry32(a: number) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// -----------------------------------------------------------------------------
//  Fitness evaluation
// -----------------------------------------------------------------------------

/**
 * Mixed-population fitness. Each game picks each seat independently as either
 * "hard-2" or "hard" with p=0.5 (uniform). Fitness = the difference
 * tuned_seat_win_rate − hard_seat_win_rate. This rewards weights that make an
 * INDIVIDUAL seat play stronger, not weights that exploit team layouts.
 *
 * We also paired-replay: for each seed, run a mirror game where every seat's
 * personality is swapped (tuned <-> hard). If a candidate is genuinely better
 * it should outperform its mirror.
 */
function evaluate(weights: HardWeights, n: number, seedBase: number): number {
  setActiveHardWeights(weights);
  let tunedWins = 0, tunedSeats = 0;
  let hardWins = 0, hardSeats = 0;
  for (let i = 0; i < n; i++) {
    // Build a random layout with at least one of each personality.
    const rnd = mulberry32(seedBase + i * 1009);
    const seats: AIPersonality[] = [];
    for (let k = 0; k < 5; k++) seats.push(rnd() < 0.5 ? "hard-2" : "hard");
    // Ensure mixed:
    if (!seats.includes("hard-2")) seats[Math.floor(rnd() * 5)] = "hard-2";
    if (!seats.includes("hard")) seats[Math.floor(rnd() * 5)] = "hard";
    try {
      const wins = playOne(seats, seedBase + i * 7919);
      for (let k = 0; k < 5; k++) {
        if (seats[k] === "hard-2") { tunedSeats++; if (wins[k]) tunedWins++; }
        else { hardSeats++; if (wins[k]) hardWins++; }
      }
      // Mirror: swap personalities at every seat and replay same shuffle.
      const mirror: AIPersonality[] = seats.map((p) => p === "hard-2" ? "hard" : "hard-2");
      const winsM = playOne(mirror, seedBase + i * 7919);
      for (let k = 0; k < 5; k++) {
        if (mirror[k] === "hard-2") { tunedSeats++; if (winsM[k]) tunedWins++; }
        else { hardSeats++; if (winsM[k]) hardWins++; }
      }
    } catch (e) { /* illegal play — skip */ }
  }
  const tunedRate = tunedSeats === 0 ? 0 : tunedWins / tunedSeats;
  const hardRate = hardSeats === 0 ? 0 : hardWins / hardSeats;
  // Return the per-seat win rate difference, normalized to [0, 1] for ES sigma logic.
  // +0.5 means same; > 0.5 means tuned is better; < 0.5 means worse.
  return 0.5 + (tunedRate - hardRate) / 2;
}

function shuffleArray<T>(arr: T[], seed: number): T[] {
  const rnd = mulberry32(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// -----------------------------------------------------------------------------
//  Mutation
// -----------------------------------------------------------------------------

function mutate(base: HardWeights, sigma: number, seed: number): HardWeights {
  const rnd = mulberry32(seed);
  const out: HardWeights = { ...base };
  // Walk every numeric key and perturb relative to current magnitude.
  for (const k of Object.keys(out) as (keyof HardWeights)[]) {
    const v = out[k] as number;
    const mag = Math.max(1, Math.abs(v));
    const delta = boxMullerGaussian(rnd) * sigma * mag;
    let nv = v + delta;
    // Soft clip: keep within reasonable ranges per weight type
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
    } else if (k === "inferPropagationIters") {
      nv = Math.max(0, Math.min(3, Math.round(nv)));
    } else if (k === "inferPropagationDecay") {
      nv = Math.max(0.1, Math.min(0.9, nv));
    } else {
      nv = Math.max(0, nv);
    }
    (out as any)[k] = nv;
  }
  return out;
}

function boxMullerGaussian(rnd: () => number): number {
  const u1 = Math.max(rnd(), 1e-9);
  const u2 = rnd();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// -----------------------------------------------------------------------------
//  Main loop
// -----------------------------------------------------------------------------

function startingWeights(): HardWeights {
  if (existsSync(OUTFILE)) {
    try {
      const j = JSON.parse(readFileSync(OUTFILE, "utf8"));
      if (j && typeof j === "object" && "trumpLengthFactor" in j) {
        console.log("Resuming from existing tuned_weights.json");
        return { ...DEFAULT_HARD_WEIGHTS, ...j };
      }
    } catch { /* ignore */ }
  }
  return { ...DEFAULT_HARD_WEIGHTS };
}

console.log(`Evolutionary tuner — (1+${LAMBDA})-ES`);
console.log(`Generations=${GENERATIONS} games/eval=${GAMES_PER_EVAL} → total games ≈ ${GENERATIONS * (LAMBDA + 1) * GAMES_PER_EVAL}`);
console.log("");

let best = startingWeights();
let sigma = INITIAL_SIGMA;
const t0 = Date.now();

// Baseline fitness of unchanged weights (sanity)
const baselineFitness = evaluate(best, GAMES_PER_EVAL * 2, 1_000_000);
console.log(`Gen 0 (baseline default weights): fitness=${(baselineFitness * 100).toFixed(1)}%   sigma=${sigma.toFixed(3)}`);
let bestFitness = baselineFitness;

for (let gen = 1; gen <= GENERATIONS; gen++) {
  const offspring: { w: HardWeights; fit: number }[] = [];
  let successes = 0;
  for (let k = 0; k < LAMBDA; k++) {
    const seed = gen * 31_337 + k * 101 + 1;
    const cand = mutate(best, sigma, seed);
    const fit = evaluate(cand, GAMES_PER_EVAL, gen * 1_000_003 + k * 17);
    offspring.push({ w: cand, fit });
    if (fit > bestFitness) successes++;
  }
  offspring.sort((a, b) => b.fit - a.fit);
  const top = offspring[0];
  if (top.fit > bestFitness) {
    best = top.w;
    bestFitness = top.fit;
  }
  // 1/5 success rule
  const successRate = successes / LAMBDA;
  if (successRate > 0.2) sigma = Math.min(SIGMA_MAX, sigma * SIGMA_GROW);
  else sigma = Math.max(SIGMA_MIN, sigma * SIGMA_SHRINK);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  const topFits = offspring.slice(0, 3).map((o) => (o.fit * 100).toFixed(1)).join(", ");
  console.log(`Gen ${String(gen).padStart(3)}: best=${(bestFitness * 100).toFixed(1)}%  top3=[${topFits}]  σ=${sigma.toFixed(3)}  succ=${successes}/${LAMBDA}  elapsed=${elapsed}s`);

  // Checkpoint best every 10 generations
  if (gen % 10 === 0) {
    writeFileSync(OUTFILE, JSON.stringify({ ...best, __meta: { generation: gen, fitness: bestFitness } }, null, 2));
  }
}

writeFileSync(OUTFILE, JSON.stringify({ ...best, __meta: { generation: GENERATIONS, fitness: bestFitness } }, null, 2));
console.log(`\nFinal best fitness (vs default Hard): ${(bestFitness * 100).toFixed(1)}%`);
console.log(`Saved to ${OUTFILE}`);

// -----------------------------------------------------------------------------
//  Larger verification A/B
// -----------------------------------------------------------------------------

const VERIFY_N = 2000;
console.log(`\nVerification A/B: ${VERIFY_N} games (each ×2 for mirror) on fresh seeds…`);
const verifyFit = evaluate(best, VERIFY_N, 9_876_543);
const edgePts = ((verifyFit - 0.5) * 200).toFixed(2);
console.log(`Verification: tuned per-seat win-rate edge = ${edgePts}pp  (0pp = no edge; >2pp = meaningful)`);
