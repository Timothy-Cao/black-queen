// =============================================================================
//  Follow-guard A/B — measures impact of low_point_enemy_follow_guard on hard-4.
//
//  Paired-seed mirror replay. For each seed, runs once with guard ON
//  (default) and once with guard OFF (via set_follow_guard_wasm(false)).
//  Measures hard-4 net delta per seed.
//
//  Seats: hard-4 in seat 0, four hard-3 opponents. Caller-team mirror not
//  needed because the guard only affects hard-4 plays (which are only made
//  by seat 0), so flipping the guard isolates exactly its effect on hard-4.
//
//  Usage:
//    HARD4_TIME_MS=80 npx tsx src/game/_follow_guard_ab.ts 1000 docs/bid_calibration/follow_guard_ab.jsonl
// =============================================================================

import { mkdirSync, writeFileSync } from "fs";
import {
  applyBid, applyDeclare, applyPass, applyPlay, collectTrick, freshGame,
} from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { AIPersonality, GameState, PlayerId, PLAYER_IDS } from "./types";
import {
  DEFAULT_HARD_WEIGHTS, HardWeights, setActiveHardWeights, setGen2HardWeights,
} from "./aiHard";
import gen2Weights from "./tuned_weights_gen2.json";
import gen3Weights from "./tuned_weights_gen3.json";

setGen2HardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen2Weights } as HardWeights);
setActiveHardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen3Weights } as HardWeights);

// Access the WASM module's toggle setter.
import { warmWasm } from "./hard4Driver";
// Dynamic import of the WASM exports; Node sync loads at module init in hard4Driver.
// We grab the module reference from a fresh import here.
const wasmNode = await import("./wasm-node/bq_wasm.js") as { set_follow_guard_wasm: (b: boolean) => void };
await warmWasm();

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
  const oldRandom = Math.random;
  Math.random = mulberry32(seed);
  try { return fn(); } finally { Math.random = oldRandom; }
}

const SUBJECT: PlayerId = 0;
const SEATS: AIPersonality[] = ["hard-4", "hard-3", "hard-3", "hard-3", "hard-3"];

type Outcome = {
  seed: number;
  guard: boolean;
  callerSeat: number | null;
  subjectIsCallerTeam: boolean;
  subjectIsCaller: boolean;
  winningBid: number;
  made: boolean;
  callerTeamPts: number;
  subjectPts: number;
  net: number;
};

function runGame(seed: number, guardOn: boolean): Outcome {
  wasmNode.set_follow_guard_wasm(guardOn);
  return withSeededRandom(seed, () => {
    let state = freshGame(
      SEATS.map((p, i) => ({ name: `P${i}`, isAI: true, aiPersonality: p })),
      300, "light", 0, false,
    );
    let safety = 0;
    while (state.phase !== "game_end") {
      if (safety++ > 10000) throw new Error("stuck");
      const r = state.round;
      if (r.pendingTrickComplete) { state = collectTrick(state); continue; }
      if (r.phase === "bidding") {
        const p = r.bidTurn!;
        const d = aiBidDecision(state, p);
        state = d.bid === "pass" ? applyPass(state, p) : applyBid(state, p, d.bid);
      } else if (r.phase === "declaring") {
        const dec = aiDeclareDecision(state, r.bidder!);
        state = applyDeclare(state, dec.trump, dec.partnerCard);
      } else if (r.phase === "playing") {
        const card = aiPlayDecision(state, r.toPlay);
        state = applyPlay(state, r.toPlay, card);
      } else throw new Error(`unhandled phase ${r.phase}`);
    }
    const r = state.round;
    const callerSeat = r.bidder ?? null;
    const team = new Set<PlayerId>([r.bidder!, ...(r.partners ?? [])]);
    const callerTeamPts = PLAYER_IDS.filter(p => team.has(p))
      .reduce((s, p) => s + (r.roundPoints?.[p] ?? 0), 0);
    const winningBid = r.winningBid ?? 0;
    const made = callerTeamPts >= winningBid;
    const subjectIsCallerTeam = callerSeat !== null && team.has(SUBJECT);
    const subjectIsCaller = callerSeat === SUBJECT;
    const subjectWins = subjectIsCallerTeam ? made : !made;
    const net = subjectWins ? +winningBid : -winningBid;
    return {
      seed, guard: guardOn, callerSeat, subjectIsCallerTeam, subjectIsCaller,
      winningBid, made, callerTeamPts, subjectPts: r.roundPoints?.[SUBJECT] ?? 0, net,
    };
  });
}

const argv = process.argv;
const N = parseInt(argv[2] ?? "500", 10);
const outPath = argv[3] ?? "docs/bid_calibration/follow_guard_ab.jsonl";
mkdirSync(outPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });

const rows: string[] = [];
const startTime = Date.now();
for (let i = 0; i < N; i++) {
  const seed = 3_000_000 + i;
  try {
    rows.push(JSON.stringify(runGame(seed, false)));  // baseline (guard OFF)
    rows.push(JSON.stringify(runGame(seed, true)));   // treatment (guard ON)
  } catch (e) {
    rows.push(JSON.stringify({ seed, error: String(e) }));
  }
  if ((i + 1) % 50 === 0) {
    const elapsed = (Date.now() - startTime) / 1000;
    console.error(`progress: ${i + 1}/${N} seeds, ${elapsed.toFixed(0)}s, ETA ${((N - i - 1) / ((i + 1) / elapsed)).toFixed(0)}s`);
  }
}
writeFileSync(outPath, rows.join("\n") + "\n");
console.log(`wrote ${rows.length} rows (${N} seeds × 2) to ${outPath}`);
