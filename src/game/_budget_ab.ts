// Paired-seed A/B for hard-4's per-move budget. Same seed at multiple budgets
// — directly answers "does more search help against hard-3?". Fixes the
// unseeded-mirror_arena confound that made the 80/300/800 sweep uninterpretable.
//
// Usage: npx tsx src/game/_budget_ab.ts 200 docs/budget_sweep/paired.jsonl

import { mkdirSync, writeFileSync } from "fs";
import {
  applyBid, applyDeclare, applyPass, applyPlay, collectTrick, freshGame,
} from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { AIPersonality, GameState, PlayerId, PLAYER_IDS } from "./types";
import {
  DEFAULT_HARD_WEIGHTS, HardWeights, setActiveHardWeights, setGen2HardWeights,
} from "./aiHard";
import { setHard4TimeMs, warmWasm } from "./hard4Driver";
import gen2Weights from "./tuned_weights_gen2.json";
import gen3Weights from "./tuned_weights_gen3.json";

setGen2HardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen2Weights } as HardWeights);
setActiveHardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen3Weights } as HardWeights);
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

// 1×hard-4 vs 4×hard-3 mirror — alternate hard-4 seat across the pair.
function runOne(seed: number, hard4Seat: PlayerId, budgetMs: number): {
  hard4Won: boolean; hard4WasCaller: boolean; bid: number; made: boolean;
} {
  setHard4TimeMs(budgetMs);
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
      } else throw new Error(`unhandled phase ${r.phase}`);
    }
    const r = state.round;
    const caller = r.bidder ?? -1;
    const team = new Set<PlayerId>([caller as PlayerId, ...(r.partners ?? [])]);
    const teamPts = PLAYER_IDS.filter(p => team.has(p)).reduce((s,p) => s + (r.roundPoints?.[p] ?? 0), 0);
    const bid = r.winningBid ?? 0;
    const made = teamPts >= bid;
    const hard4InTeam = team.has(hard4Seat);
    const hard4Won = hard4InTeam ? made : !made;
    return { hard4Won, hard4WasCaller: caller === hard4Seat, bid, made };
  });
}

const BUDGETS = [80, 300, 800];
const argv = process.argv;
const N = parseInt(argv[2] ?? "200", 10);
const outPath = argv[3] ?? "docs/budget_sweep/paired.jsonl";
mkdirSync(outPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });

const rows: string[] = [];
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const seed = 4_000_000 + i;
  const hard4Seat = (i % 5) as PlayerId;
  for (const budget of BUDGETS) {
    try {
      const out = runOne(seed, hard4Seat, budget);
      rows.push(JSON.stringify({ seed, hard4Seat, budget, ...out }));
    } catch (e) {
      rows.push(JSON.stringify({ seed, hard4Seat, budget, error: String(e) }));
    }
  }
  if ((i + 1) % 20 === 0) {
    const elapsed = (Date.now() - t0) / 1000;
    console.error(`progress: ${i + 1}/${N} seeds, ${elapsed.toFixed(0)}s, ETA ${((N - i - 1) / ((i + 1) / elapsed)).toFixed(0)}s`);
  }
}
writeFileSync(outPath, rows.join("\n") + "\n");
console.log(`wrote ${rows.length} rows (${N} seeds × ${BUDGETS.length} budgets) to ${outPath}`);
