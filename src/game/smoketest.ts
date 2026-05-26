// Standalone smoke test: simulate full games with all-AI players to ensure engine completes.
// Run with: npx tsx src/game/smoketest.ts
import { freshGame, applyBid, applyPass, applyDeclare, applyPlay, collectTrick, startNextRound } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";

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
        s = applyPlay(s, r.toPlay, card);
      }
    } else if (s.phase === "round_end") {
      // tally
      const delta = r.deltaScores![r.bidder!];
      if (delta > 0) bidsMade++; else bidsFailed++;
      s = startNextRound(s);
    } else {
      throw new Error("Unhandled phase: " + r.phase);
    }
  }
  return {
    rounds: s.history.length + 1,
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

console.log("Running 5 games...");
for (let i = 1; i <= 5; i++) {
  const r = runGame(i * 7919);
  console.log(`Game ${i}: ${r.rounds} rounds, scores=${r.finalScores.join(",")}, made=${r.bidsMade}, failed=${r.bidsFailed}`);
}
console.log("All games completed without errors.");
