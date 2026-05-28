// =============================================================================
//  Bid-weight A/B harness — SUBJECT plays a modified bidder weight set vs
//  baseline opponents. Measures SUBJECT's net per game.
//
//  Used to test bidCap / bidCapExtraordinary raises and similar tweaks.
//  Strategy: swap module-level activeHardWeights before each AI call based on
//  current player → SUBJECT-only weight override without forking dispatchers.
//
//  bidCap-only edits don't affect play decisions (verified: bidCap is only
//  read in hardBidImpl). So play strength is identical between SUBJECT and
//  opponents — divergence comes purely from bid choices.
//
//  Usage:
//    npx tsx src/game/_bid_weight_ab.ts 2000 docs/bid_calibration/weight_ab.jsonl
// =============================================================================

import { mkdirSync, writeFileSync } from "fs";
import {
  applyBid, applyDeclare, applyPass, applyPlay, cardLabel, collectTrick, freshGame,
} from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { AIPersonality, GameState, PlayerId, PLAYER_IDS } from "./types";
import {
  DEFAULT_HARD_WEIGHTS, HardWeights, setActiveHardWeights, setGen2HardWeights,
} from "./aiHard";
import gen2Weights from "./tuned_weights_gen2.json";
import gen3Weights from "./tuned_weights_gen3.json";

const BASELINE: HardWeights = { ...DEFAULT_HARD_WEIGHTS, ...gen3Weights } as HardWeights;
setGen2HardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen2Weights } as HardWeights);
setActiveHardWeights(BASELINE);

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
// Seat personality via env var BQ_SEATS (defaults hard-3 for speed).
// Set BQ_SEATS=hard-4 to validate on hard-4 (slow; WASM init required).
const PERS: AIPersonality = (process.env.BQ_SEATS as AIPersonality) ?? "hard-3";
const SEATS: AIPersonality[] = [PERS, PERS, PERS, PERS, PERS];

type Outcome = {
  seed: number;
  variant: string;
  callerSeat: number | null;
  subjectIsCallerTeam: boolean;
  subjectIsCaller: boolean;
  winningBid: number;
  made: boolean;
  callerTeamPts: number;
  net: number;
};

function runGame(seed: number, variant: string, subjectW: HardWeights, oppW: HardWeights): Outcome {
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
      // Swap active weights per current player so SUBJECT sees subjectW, others see oppW.
      const p =
        r.phase === "bidding" ? r.bidTurn! :
        r.phase === "declaring" ? r.bidder! :
        r.phase === "playing" ? r.toPlay :
        0;
      setActiveHardWeights(p === SUBJECT ? subjectW : oppW);

      if (r.phase === "bidding") {
        const d = aiBidDecision(state, p);
        state = d.bid === "pass" ? applyPass(state, p) : applyBid(state, p, d.bid);
      } else if (r.phase === "declaring") {
        const dec = aiDeclareDecision(state, p);
        state = applyDeclare(state, dec.trump, dec.partnerCard);
      } else if (r.phase === "playing") {
        const card = aiPlayDecision(state, p);
        state = applyPlay(state, p, card);
      } else {
        throw new Error(`unhandled phase ${r.phase}`);
      }
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
      seed, variant, callerSeat, subjectIsCallerTeam, subjectIsCaller,
      winningBid, made, callerTeamPts, net,
    };
  });
}

// Define variants. baseline = no-op control (proves harness adds no bias).
// Set BQ_VARIANTS=cap270 to run only the recommended candidate vs baseline (fast hard-4 mode).
const ALL_VARIANTS: { name: string; weights: HardWeights }[] = [
  { name: "baseline",  weights: BASELINE },
  { name: "cap250",    weights: { ...BASELINE, bidCap: 250 } },
  { name: "cap260",    weights: { ...BASELINE, bidCap: 260 } },
  { name: "cap270",    weights: { ...BASELINE, bidCap: 270 } },
  { name: "cap280",    weights: { ...BASELINE, bidCap: 280 } },
  { name: "no-cap",    weights: { ...BASELINE, bidCap: 300, bidCapExtraordinary: 300 } },
  { name: "extra260",  weights: { ...BASELINE, bidCapExtraordinary: 260 } },
  { name: "extra250",  weights: { ...BASELINE, bidCapExtraordinary: 250 } },
];
const wanted = (process.env.BQ_VARIANTS ?? "").split(",").map(s => s.trim()).filter(Boolean);
const variants = wanted.length > 0
  ? ALL_VARIANTS.filter(v => v.name === "baseline" || wanted.includes(v.name))
  : ALL_VARIANTS;

const argv = process.argv;
const N = parseInt(argv[2] ?? "2000", 10);
const outPath = argv[3] ?? "docs/bid_calibration/weight_ab.jsonl";
mkdirSync(outPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });

const rows: string[] = [];
const startTime = Date.now();
for (let i = 0; i < N; i++) {
  const seed = 2_000_000 + i;
  for (const v of variants) {
    try {
      const out = runGame(seed, v.name, v.weights, BASELINE);
      rows.push(JSON.stringify(out));
    } catch (e) {
      rows.push(JSON.stringify({ seed, variant: v.name, error: String(e) }));
    }
  }
  if ((i + 1) % 100 === 0) {
    const elapsed = (Date.now() - startTime) / 1000;
    console.error(`progress: ${i + 1}/${N} seeds, ${elapsed.toFixed(0)}s, ETA ${((N - i - 1) / ((i + 1) / elapsed)).toFixed(0)}s`);
  }
}
writeFileSync(outPath, rows.join("\n") + "\n");
console.log(`wrote ${rows.length} rows (${N} seeds × ${variants.length} variants) to ${outPath}`);
