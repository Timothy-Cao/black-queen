// Standalone smoke test: simulate full games with all-AI players to ensure engine completes.
// Run with: npx tsx src/game/smoketest.ts
import { freshGame, applyBid, applyPass, applyDeclare, applyPlay, collectTrick } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { legalPlays } from "./rules";

function runGame(seed: number, personality: "normal" | "hard" | "random" = "normal"): { rounds: number; finalScores: number[]; bidsMade: number; bidsFailed: number; winningBid: number | undefined; teamPoints: number } {
  Math.random = mulberry32(seed);
  let s = freshGame([
    { name: "P0", isAI: true, aiPersonality: personality },
    { name: "P1", isAI: true, aiPersonality: personality },
    { name: "P2", isAI: true, aiPersonality: personality },
    { name: "P3", isAI: true, aiPersonality: personality },
    { name: "P4", isAI: true, aiPersonality: personality },
  ], 300);
  let bidsMade = 0;
  let bidsFailed = 0;
  let safety = 0;
  while (s.phase !== "game_end") {
    safety++;
    if (safety > 100000) {
      console.error("Stuck phase=" + s.phase + " r.phase=" + s.round.phase + " toPlay=" + s.round.toPlay + " bidTurn=" + s.round.bidTurn + " pendTC=" + s.round.pendingTrickComplete + " trickLen=" + (s.round.currentTrick?.plays.length ?? "no"));
      throw new Error("Infinite loop in game");
    }
    const r = s.round;
    if (r.phase === "bidding") {
      const target = r.bidTurn!;
      const d = aiBidDecision(s, target);
      s = d.bid === "pass" ? applyPass(s, target) : applyBid(s, target, d.bid);
    } else if (r.phase === "declaring") {
      const d = aiDeclareDecision(s, r.bidder!);
      s = applyDeclare(s, d.trump, d.partnerCard);
    } else if (r.phase === "playing") {
      if (r.pendingTrickComplete) {
        s = collectTrick(s);
      } else {
        const card = aiPlayDecision(s, r.toPlay);
        // ASSERT: AI must only return a card that is legal under the follow-suit rule.
        const hand = s.round.hands[s.round.toPlay];
        const legal = legalPlays(hand, s.round.currentTrick);
        if (!legal.some((c) => c.id === card.id)) {
          throw new Error(
            `AI returned illegal play: ${card.id} (suit ${card.suit}, rank ${card.rank}). ` +
            `Trick leader led ${s.round.currentTrick?.plays[0]?.card.suit}. ` +
            `Legal options were: ${legal.map((c) => c.id).join(",")}.`
          );
        }
        s = applyPlay(s, r.toPlay, card);
      }
    } else {
      throw new Error("Unhandled phase: " + r.phase);
    }
  }
  // Single-game model: one round only. Tally based on the final round's delta.
  const finalRound = s.round;
  if (finalRound.bidder !== undefined && finalRound.deltaScores) {
    const delta = finalRound.deltaScores[finalRound.bidder] ?? 0;
    if (delta > 0) bidsMade++; else bidsFailed++;
  }
  // Compute the winning bid and team capture for diagnostic.
  let winningBid: number | undefined = undefined;
  let teamPoints = 0;
  if (finalRound.bidder !== undefined && finalRound.roundPoints) {
    winningBid = finalRound.winningBid;
    const team = new Set<number>([finalRound.bidder, ...(finalRound.partners ?? [])]);
    for (const p of [0,1,2,3,4]) if (team.has(p)) teamPoints += finalRound.roundPoints[p as 0|1|2|3|4] ?? 0;
  }
  return {
    rounds: 1,
    finalScores: s.players.map((p) => p.scoreTotal),
    bidsMade,
    bidsFailed,
    winningBid,
    teamPoints,
  };
}

function mulberry32(a: number) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const N = parseInt(process.argv[2] || "5", 10);
const PERSONALITY = (process.argv[3] || "normal") as "normal" | "hard" | "random";

console.log(`Running ${N} games with ${PERSONALITY} AI (asserting every play legal)...`);
let totalMade = 0;
let totalFailed = 0;
const bids: number[] = [];
const captures: number[] = [];

for (let i = 1; i <= N; i++) {
  const r = runGame(i * 7919, PERSONALITY);
  totalMade += r.bidsMade;
  totalFailed += r.bidsFailed;
  if (r.winningBid !== undefined) {
    bids.push(r.winningBid);
    captures.push(r.teamPoints);
  }
  if (N <= 10) {
    console.log(`Game ${i}: bid=${r.winningBid ?? "—"}, captured=${r.teamPoints}, made=${r.bidsMade}, failed=${r.bidsFailed}`);
  }
}
const avg = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : "—";
const min = (arr: number[]) => arr.length ? Math.min(...arr) : "—";
const max = (arr: number[]) => arr.length ? Math.max(...arr) : "—";
console.log(`\nAll ${N} games completed, no illegal AI plays detected.`);
console.log(`Bids: avg=${avg(bids)} min=${min(bids)} max=${max(bids)}; Captured: avg=${avg(captures)}`);
console.log(`Made: ${totalMade}  Failed: ${totalFailed}  (${(totalMade / (totalMade + totalFailed) * 100).toFixed(0)}% success)`);
