// =============================================================================
//  Head-to-head matrix for AI personalities.
//
//  Deterministic same-seed mirror pairs:
//    A: one p1 seat vs four p2 seats
//    B: one p2 seat vs four p1 seats
//
//  Usage:
//    HARD4_TIME_MS=80 npx tsx src/game/_matrix.ts 300 hard,hard-2,hard-3,hard-4,normal
//    BQ_TS_DISCARD_GUARD_OFF=1 HARD4_TIME_MS=80 npx tsx src/game/_matrix.ts 300 hard,hard-2,hard-3,hard-4,normal
// =============================================================================

import { applyBid, applyDeclare, applyPass, applyPlay, collectTrick, freshGame } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { legalPlays } from "./rules";
import { AIPersonality, GameState, PlayerId, PLAYER_IDS } from "./types";
import { DEFAULT_HARD_WEIGHTS, HardWeights, setActiveHardWeights, setGen2HardWeights } from "./aiHard";
import gen2Weights from "./tuned_weights_gen2.json";
import gen3Weights from "./tuned_weights_gen3.json";

setGen2HardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen2Weights } as HardWeights);
setActiveHardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen3Weights } as HardWeights);

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function withSeededRandom<T>(seed: number, fn: () => T): T {
  const oldRandom = Math.random;
  Math.random = mulberry32(seed);
  try { return fn(); }
  finally { Math.random = oldRandom; }
}

function runOne(seats: AIPersonality[], seed: number): boolean[] {
  return withSeededRandom(seed, () => {
    let state: GameState = freshGame(seats.map((p, i) => ({
      name: `P${i}`, isAI: true, aiPersonality: p,
    })), 300, "light", 0, false);
    let safety = 0;
    while (state.phase !== "game_end") {
      if (safety++ > 10000) throw new Error("stuck game");
      const r = state.round;
      if (r.pendingTrickComplete) {
        state = collectTrick(state);
      } else if (r.phase === "bidding") {
        const p = r.bidTurn!;
        const d = aiBidDecision(state, p);
        state = d.bid === "pass" ? applyPass(state, p) : applyBid(state, p, d.bid);
      } else if (r.phase === "declaring") {
        const d = aiDeclareDecision(state, r.bidder!);
        state = applyDeclare(state, d.trump, d.partnerCard);
      } else if (r.phase === "playing") {
        const p = r.toPlay;
        const card = aiPlayDecision(state, p);
        const legal = legalPlays(r.hands[p], r.currentTrick);
        if (!legal.some((c) => c.id === card.id)) {
          throw new Error(`illegal ${seats[p]} P${p}`);
        }
        state = applyPlay(state, p, card);
      } else {
        throw new Error(`phase ${r.phase}`);
      }
    }

    const r = state.round;
    const caller = r.bidder!;
    const team = new Set<PlayerId>([caller, ...(r.partners ?? [])]);
    const teamPts = PLAYER_IDS
      .filter((p) => team.has(p))
      .reduce((sum, p) => sum + (r.roundPoints?.[p] ?? 0), 0);
    const made = teamPts >= (r.winningBid ?? 0);
    return PLAYER_IDS.map((p) => made ? team.has(p) : !team.has(p));
  });
}

function seatsFor(one: AIPersonality, four: AIPersonality, slot: number): AIPersonality[] {
  const seats: AIPersonality[] = [four, four, four, four, four];
  seats[slot] = one;
  return seats;
}

interface Result {
  aSeats: number;
  aWins: number;
  bSeats: number;
  bWins: number;
  errors: number;
}

function pair(a: AIPersonality, b: AIPersonality, n: number, seedBase: number): Result {
  const out: Result = { aSeats: 0, aWins: 0, bSeats: 0, bWins: 0, errors: 0 };
  for (let i = 0; i < n; i++) {
    const slot = i % 5;
    const seed = seedBase + i * 7919;
    const layoutA = seatsFor(a, b, slot);
    const layoutB = seatsFor(b, a, slot);
    try {
      const winA = runOne(layoutA, seed);
      const winB = runOne(layoutB, seed);
      for (const p of PLAYER_IDS) {
        if (layoutA[p] === a) { out.aSeats++; if (winA[p]) out.aWins++; }
        else { out.bSeats++; if (winA[p]) out.bWins++; }
        if (layoutB[p] === a) { out.aSeats++; if (winB[p]) out.aWins++; }
        else { out.bSeats++; if (winB[p]) out.bWins++; }
      }
    } catch {
      out.errors++;
    }
  }
  return out;
}

const n = parseInt(process.argv[2] ?? "300", 10);
const names = (process.argv[3] ?? "hard,hard-2,hard-3,hard-4,normal")
  .split(",").map((s) => s.trim()).filter(Boolean) as AIPersonality[];

const rows: string[] = [];
rows.push(`matrix n=${n} pairs x2 mirror, personalities=${names.join(",")}`);
rows.push(`BQ_TS_DISCARD_GUARD_OFF=${process.env.BQ_TS_DISCARD_GUARD_OFF ? "1" : "0"} HARD4_TIME_MS=${process.env.HARD4_TIME_MS ?? "default"}`);
rows.push("");
rows.push("matchup              | A win% | B win% | A edge");
rows.push("-".repeat(58));
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const a = names[i], b = names[j];
    const seedBase = 41_000_000 + i * 1_000_003 + j * 97_531;
    const r = pair(a, b, n, seedBase);
    const ar = r.aWins / r.aSeats;
    const br = r.bWins / r.bSeats;
    rows.push(`${`${a} vs ${b}`.padEnd(20)} | ${(ar * 100).toFixed(2).padStart(6)} | ${(br * 100).toFixed(2).padStart(6)} | ${((ar - br) * 100).toFixed(2).padStart(6)}pp${r.errors ? ` (${r.errors} errors)` : ""}`);
  }
}
console.log(rows.join("\n"));
