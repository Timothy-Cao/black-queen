// Lever A (learned inference) — Phase 1 data generation.
//
// Plays fast hard-3 self-play games and, at each play-phase decision snapshot,
// logs observable features (from a chosen observer `obs`) + the ground-truth
// label: does each OTHER player currently hold a copy of the partner card?
//
// The partner card's location is the single most important hidden variable
// (it defines team structure). The current Rust IntentTracker predicts this
// with a hand-tuned LLR model; this dataset is to train a learned predictor
// that can replace/augment the soft prior in belief.rs::sample_determinization.
//
// Output: JSONL, one row per (snapshot, target_player). Designed for pointwise
// training of P(target holds partner card | features).
//
// Usage: npx tsx src/game/_infer_datagen.ts 5000 docs/infer/data.jsonl

import { mkdirSync, writeFileSync } from "fs";
import { applyBid, applyDeclare, applyPass, applyPlay, collectTrick, freshGame } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { AIPersonality, Card, GameState, PlayerId, PLAYER_IDS, Suit, cardPoints } from "./types";
import { DEFAULT_HARD_WEIGHTS, HardWeights, setActiveHardWeights, setGen2HardWeights } from "./aiHard";
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
  const old = Math.random; Math.random = mulberry32(seed);
  try { return fn(); } finally { Math.random = old; }
}

const SUIT_IDX: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 };

function holdsPartnerCard(hand: Card[], pc: Card): boolean {
  return hand.some((c) => c.suit === pc.suit && c.rank === pc.rank);
}

// Build observable features for `target` from `obs`'s perspective at this state.
// All features are knowable to obs (no hidden info leaks).
function features(state: GameState, obs: PlayerId, target: PlayerId, playedBy: Card[][], bidsByPlayer: Record<number, number>, passedBy: Record<number, boolean>, voidsByPlayer: boolean[][], pcPlayedCount: number): Record<string, number> {
  const r = state.round;
  const pc = r.partnerCard!;
  const caller = r.bidder!;
  const targetPlayed = playedBy[target];
  const targetPointsPlayed = targetPlayed.reduce((s, c) => s + cardPoints(c), 0);
  const obsCopies = state.round.hands[obs].filter((c) => c.suit === pc.suit && c.rank === pc.rank).length;
  return {
    relSeat: ((target - obs + 5) % 5),
    targetIsCaller: target === caller ? 1 : 0,
    trump: SUIT_IDX[r.trump!],
    pcSuit: SUIT_IDX[pc.suit],
    pcRank: pc.rank,
    pcIsTrumpSuit: pc.suit === r.trump ? 1 : 0,
    targetBid: bidsByPlayer[target] ?? 0,
    targetPassed: passedBy[target] ? 1 : 0,
    targetWonBid: target === caller ? 1 : 0,
    winningBid: r.winningBid ?? 0,
    tricksPlayed: r.tricks?.length ?? 0,
    targetCardsLeft: state.round.hands[target].length,
    targetPointsPlayed,
    targetVoidS: voidsByPlayer[target][0] ? 1 : 0,
    targetVoidH: voidsByPlayer[target][1] ? 1 : 0,
    targetVoidD: voidsByPlayer[target][2] ? 1 : 0,
    targetVoidC: voidsByPlayer[target][3] ? 1 : 0,
    targetVoidPcSuit: voidsByPlayer[target][SUIT_IDX[pc.suit]] ? 1 : 0,
    obsHoldsPcCopies: obsCopies,
    pcCopiesPlayed: pcPlayedCount,
    pcTotalCopies: (pc.suit === "S" && pc.rank === 7) ? 1 : 2,
  };
}

function playGameAndLog(seed: number, rows: string[], obs: PlayerId): void {
  withSeededRandom(seed, () => {
    const seats: AIPersonality[] = ["hard-3","hard-3","hard-3","hard-3","hard-3"];
    let state = freshGame(seats.map((p,i)=>({name:`P${i}`,isAI:true,aiPersonality:p})), 300, "light", 0, false);
    const playedBy: Card[][] = [[],[],[],[],[]];
    const voidsByPlayer: boolean[][] = PLAYER_IDS.map(() => [false,false,false,false]);
    const bidsByPlayer: Record<number, number> = {};
    const passedBy: Record<number, boolean> = {};
    let pcPlayedCount = 0;
    let safety = 0;

    while (state.phase !== "game_end") {
      if (safety++ > 10000) throw new Error("stuck");
      const r = state.round;
      if (r.pendingTrickComplete) { state = collectTrick(state); continue; }
      if (r.phase === "bidding") {
        const p = r.bidTurn!;
        const d = aiBidDecision(state, p);
        if (d.bid === "pass") { passedBy[p] = true; state = applyPass(state, p); }
        else { bidsByPlayer[p] = d.bid; state = applyBid(state, p, d.bid); }
      } else if (r.phase === "declaring") {
        const dec = aiDeclareDecision(state, r.bidder!);
        state = applyDeclare(state, dec.trump, dec.partnerCard);
      } else if (r.phase === "playing") {
        const p = r.toPlay;
        const pc = r.partnerCard!;
        // Snapshot BEFORE the play: log features+label for each non-obs player,
        // only while there are still hidden partner-card copies to locate.
        if (p === obs) {
          const hiddenCopies = (pc.suit === "S" && pc.rank === 7 ? 1 : 2) - pcPlayedCount;
          if (hiddenCopies > 0) {
            for (const target of PLAYER_IDS) {
              if (target === obs) continue;
              const f = features(state, obs, target, playedBy, bidsByPlayer, passedBy, voidsByPlayer, pcPlayedCount);
              const label = holdsPartnerCard(state.round.hands[target], pc) ? 1 : 0;
              rows.push(JSON.stringify({ seed, obs, target, label, f }));
            }
          }
        }
        // Apply the play; track voids + played cards + partner-card reveals.
        const card = aiPlayDecision(state, p);
        const trick = r.currentTrick;
        if (trick && trick.plays.length > 0) {
          const led = trick.plays[0].card.suit;
          if (card.suit !== led) voidsByPlayer[p][SUIT_IDX[led]] = true;
        }
        if (card.suit === pc.suit && card.rank === pc.rank) pcPlayedCount++;
        playedBy[p].push(card);
        state = applyPlay(state, p, card);
      } else throw new Error(`phase ${r.phase}`);
    }
  });
}

const argv = process.argv;
const N = parseInt(argv[2] ?? "5000", 10);
const outPath = argv[3] ?? "docs/infer/data.jsonl";
mkdirSync(outPath.split("/").slice(0,-1).join("/") || ".", { recursive: true });

const rows: string[] = [];
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const seed = 12_000_000 + i;
  const obs = (i % 5) as PlayerId; // rotate observer for coverage
  try { playGameAndLog(seed, rows, obs); } catch (e) { /* skip */ }
  if ((i + 1) % 500 === 0) {
    const el = (Date.now()-t0)/1000;
    console.error(`progress: ${i+1}/${N} games, ${rows.length} rows, ${el.toFixed(0)}s`);
  }
}
writeFileSync(outPath, rows.join("\n") + "\n");
console.log(`wrote ${rows.length} rows from ${N} games to ${outPath}`);
