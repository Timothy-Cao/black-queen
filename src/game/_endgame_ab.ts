// PUCT prior A/B. Hard-4 (greedy rollout default) in seat 0 vs 4×hard-3.
// Paired-seed: baseline (UCB1, no prior) vs treatment(s) (PUCT with prior).
// Tests whether prior-guided root selection helps at the small iteration budget.
//
// Usage: HARD4_TIME_MS=80 npx tsx src/game/_puct_ab.ts 3000 docs/budget_sweep/endgame_ab.jsonl

import { mkdirSync, writeFileSync } from "fs";
import {
  applyBid, applyDeclare, applyPass, applyPlay, collectTrick, freshGame,
} from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { AIPersonality, PlayerId, PLAYER_IDS } from "./types";
import {
  DEFAULT_HARD_WEIGHTS, HardWeights, setActiveHardWeights, setGen2HardWeights,
} from "./aiHard";
import { warmWasm } from "./hard4Driver";
import gen2Weights from "./tuned_weights_gen2.json";
import gen3Weights from "./tuned_weights_gen3.json";

setGen2HardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen2Weights } as HardWeights);
setActiveHardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen3Weights } as HardWeights);
const wasmNode = await import("./wasm-node/bq_wasm.js") as {
  set_endgame_enabled_wasm: (enabled: boolean) => void;
};
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

// "on" = endgame solver active (current wasm shipping behavior = baseline).
// "off" = disabled (matches native, which A/B'd the solver at -1.1pp).
const VARIANTS = [
  { name: "endgame_on",  endgame: true },
  { name: "endgame_off", endgame: false },
];

function runOne(seed: number, hard4Seat: PlayerId, v: typeof VARIANTS[number]): {
  hard4Won: boolean; hard4WasCaller: boolean; bid: number; made: boolean;
} {
  wasmNode.set_endgame_enabled_wasm(v.endgame);
  const seats: AIPersonality[] = ["hard-3","hard-3","hard-3","hard-3","hard-3"];
  seats[hard4Seat] = "hard-4";
  return withSeededRandom(seed, () => {
    let state = freshGame(
      seats.map((p, i) => ({ name: `P${i}`, isAI: true, aiPersonality: p })),
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
      } else throw new Error(`phase ${r.phase}`);
    }
    const r = state.round;
    const caller = r.bidder ?? -1;
    const team = new Set<PlayerId>([caller as PlayerId, ...(r.partners ?? [])]);
    const teamPts = PLAYER_IDS.filter(p => team.has(p)).reduce((s,p) => s + (r.roundPoints?.[p] ?? 0), 0);
    const bid = r.winningBid ?? 0;
    const made = teamPts >= bid;
    const hard4InTeam = team.has(hard4Seat);
    return {
      hard4Won: hard4InTeam ? made : !made,
      hard4WasCaller: caller === hard4Seat,
      bid, made,
    };
  });
}

const argv = process.argv;
const N = parseInt(argv[2] ?? "3000", 10);
const outPath = argv[3] ?? "docs/budget_sweep/endgame_ab.jsonl";
mkdirSync(outPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });

const rows: string[] = [];
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const seed = 9_000_000 + i;
  const hard4Seat = (i % 5) as PlayerId;
  for (const v of VARIANTS) {
    try {
      const out = runOne(seed, hard4Seat, v);
      rows.push(JSON.stringify({ seed, hard4Seat, variant: v.name, ...out }));
    } catch (e) {
      rows.push(JSON.stringify({ seed, hard4Seat, variant: v.name, error: String(e) }));
    }
  }
  if ((i + 1) % 50 === 0) {
    const elapsed = (Date.now() - t0) / 1000;
    console.error(`progress: ${i + 1}/${N} seeds, ${elapsed.toFixed(0)}s, ETA ${((N - i - 1) / ((i + 1) / elapsed)).toFixed(0)}s`);
  }
}
writeFileSync(outPath, rows.join("\n") + "\n");
console.log(`wrote ${rows.length} rows (${N} seeds × ${VARIANTS.length} variants) to ${outPath}`);
