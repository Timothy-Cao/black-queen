// Standalone smoke test: simulate full games with all-AI players to ensure engine completes.
// Run with: npx tsx src/game/smoketest.ts
import { freshGame, applyBid, applyPass, applyDeclare, applyPlay, collectTrick } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { legalPlays } from "./rules";

function runGame(seed: number): { rounds: number; finalScores: number[]; bidsMade: number; bidsFailed: number } {
  Math.random = mulberry32(seed);
  let s = freshGame([
    { name: "P0", isAI: true },
    { name: "P1", isAI: true },
    { name: "P2", isAI: true },
    { name: "P3", isAI: true },
    { name: "P4", isAI: true },
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
  return {
    rounds: 1,
    finalScores: s.players.map((p) => p.scoreTotal),
    bidsMade,
    bidsFailed,
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
console.log(`Running ${N} games (asserting every AI play is legal)...`);
let totalRounds = 0;
let totalMade = 0;
let totalFailed = 0;
for (let i = 1; i <= N; i++) {
  const r = runGame(i * 7919);
  totalRounds += r.rounds;
  totalMade += r.bidsMade;
  totalFailed += r.bidsFailed;
  if (N <= 10) {
    console.log(`Game ${i}: ${r.rounds} rounds, scores=${r.finalScores.join(",")}, made=${r.bidsMade}, failed=${r.bidsFailed}`);
  }
}
console.log(`\nAll ${N} games completed, no illegal AI plays detected.`);
console.log(`Totals: ${totalRounds} rounds, ${totalMade} bids made, ${totalFailed} bids failed.`);
