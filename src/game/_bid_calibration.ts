// =============================================================================
//  Bid calibration harness — measures EV(bidCap) per hand for a subject seat.
//
//  Idea (see docs/bid_calibration_plan.md):
//    For each random hand H dealt to SUBJECT (seat 0), simulate the full game
//    once per "bid cap" condition:
//      cap=pass  : SUBJECT always passes in the auction
//      cap=N     : SUBJECT bids normally up to N, then passes if forced higher
//    Record net score to SUBJECT for each (hand, cap). Bucket by hand features
//    offline and find the cap that maximizes mean net score per bucket. Compare
//    to what the current hard-3 bidder actually picks → calibration delta.
//
//  Output: JSONL rows, one per (hand, cap) trial. Aggregate with a separate
//  script or by reading the file. Fields: seed, cap, hand, callerSeat,
//  subjectIsCallerTeam, winningBid, made, subjectPts, callerTeamPts, net.
//
//  Usage:
//    npx tsx src/game/_bid_calibration.ts 2000 docs/bid_calibration/raw.jsonl
// =============================================================================

import { mkdirSync, writeFileSync } from "fs";
import {
  applyBid, applyDeclare, applyPass, applyPlay, cardLabel, collectTrick, freshGame,
} from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { AIPersonality, GameState, PlayerId, PLAYER_IDS, Card } from "./types";
import {
  DEFAULT_HARD_WEIGHTS, HardWeights, setActiveHardWeights, setGen2HardWeights,
} from "./aiHard";
import gen2Weights from "./tuned_weights_gen2.json";
import gen3Weights from "./tuned_weights_gen3.json";

setGen2HardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen2Weights } as HardWeights);
setActiveHardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen3Weights } as HardWeights);

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
const OPP: AIPersonality = "hard-3";
const SEATS: AIPersonality[] = [OPP, OPP, OPP, OPP, OPP]; // SUBJECT plays hard-3 too
const CAPS: (number | "pass")[] = ["pass", 175, 200, 225, 250, 275];

type Outcome = {
  seed: number;
  cap: number | "pass";
  hand: string;
  callerSeat: PlayerId | null;
  subjectIsCallerTeam: boolean;
  winningBid: number;
  made: boolean;
  subjectPts: number;
  callerTeamPts: number;
  net: number; // from SUBJECT team perspective
};

function playGame(seed: number, cap: number | "pass"): Outcome {
  return withSeededRandom(seed, () => {
    let state = freshGame(
      SEATS.map((p, i) => ({ name: `P${i}`, isAI: true, aiPersonality: p })),
      300, "light", 0, false,
    );
    const initialHand = state.round.hands[SUBJECT].map(cardLabel).join(" ");
    let safety = 0;
    while (state.phase !== "game_end") {
      if (safety++ > 10000) throw new Error("stuck");
      const r = state.round;
      if (r.pendingTrickComplete) { state = collectTrick(state); continue; }
      if (r.phase === "bidding") {
        const p = r.bidTurn!;
        let d: { bid: number | "pass" };
        if (p === SUBJECT) {
          if (cap === "pass") d = { bid: "pass" };
          else {
            d = aiBidDecision(state, p);
            if (d.bid !== "pass" && d.bid > cap) d = { bid: "pass" };
          }
        } else {
          d = aiBidDecision(state, p);
        }
        state = d.bid === "pass" ? applyPass(state, p) : applyBid(state, p, d.bid);
      } else if (r.phase === "declaring") {
        const caller = r.bidder!;
        const dec = aiDeclareDecision(state, caller);
        state = applyDeclare(state, dec.trump, dec.partnerCard);
      } else if (r.phase === "playing") {
        const p = r.toPlay;
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
    const subjectWins = subjectIsCallerTeam ? made : !made;
    const net = subjectWins ? +winningBid : -winningBid;
    return {
      seed, cap, hand: initialHand,
      callerSeat, subjectIsCallerTeam, winningBid, made,
      subjectPts: r.roundPoints?.[SUBJECT] ?? 0,
      callerTeamPts, net,
    };
  });
}

const argv = process.argv;
const N = parseInt(argv[2] ?? "2000", 10);
const outPath = argv[3] ?? "docs/bid_calibration/raw.jsonl";

mkdirSync(outPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });

const rows: string[] = [];
const startTime = Date.now();
for (let i = 0; i < N; i++) {
  const seed = 1_000_000 + i;
  for (const cap of CAPS) {
    try {
      const out = playGame(seed, cap);
      rows.push(JSON.stringify(out));
    } catch (e) {
      rows.push(JSON.stringify({ seed, cap, error: String(e) }));
    }
  }
  if ((i + 1) % 100 === 0) {
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (i + 1) / elapsed;
    const eta = (N - i - 1) / rate;
    console.error(`progress: ${i + 1}/${N} hands, ${elapsed.toFixed(0)}s elapsed, ETA ${eta.toFixed(0)}s`);
  }
}
writeFileSync(outPath, rows.join("\n") + "\n");
console.log(`wrote ${rows.length} rows (${N} hands × ${CAPS.length} caps) to ${outPath}`);
