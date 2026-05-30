// Bid-calibration diagnostic. For each shuffle intensity, runs N all-<personality>
// games and reports the caller's avg winning bid, avg team capture, the gap
// (capture - bid = how much was "left on the table"), and made%.
//
//   npx tsx src/game/_bid_diag.ts 2000 hard-3
import { freshGame, applyBid, applyPass, applyDeclare, applyPlay, collectTrick } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { AIPersonality, GameState, PlayerId } from "./types";

function runOneGame(seats: AIPersonality[], intensity: number) {
  let s = freshGame(seats.map((p, i) => ({ name: `P${i}`, isAI: true, aiPersonality: p })), 300, "light", intensity);
  let safety = 0;
  while (s.phase !== "game_end") {
    if (safety++ > 100000) throw new Error("Stuck");
    const r = s.round;
    if (r.phase === "bidding") {
      const t = r.bidTurn!;
      const d = aiBidDecision(s, t);
      s = d.bid === "pass" ? applyPass(s, t) : applyBid(s, t, d.bid);
    } else if (r.phase === "declaring") {
      const d = aiDeclareDecision(s, r.bidder!);
      s = applyDeclare(s, d.trump, d.partnerCard);
    } else if (r.phase === "playing") {
      if (r.pendingTrickComplete) s = collectTrick(s);
      else s = applyPlay(s, r.toPlay, aiPlayDecision(s, r.toPlay));
    }
  }
  const final = s as GameState;
  const r = final.round;
  if (r.bidder === undefined) return null;
  const team = new Set<PlayerId>([r.bidder, ...(r.partners ?? [])]);
  const capture = ([0, 1, 2, 3, 4] as PlayerId[]).filter((p) => team.has(p)).reduce<number>((a, p) => a + (r.roundPoints?.[p] ?? 0), 0);
  return { bid: r.winningBid ?? 0, capture, made: capture >= (r.winningBid ?? 0), passedOut: r.winningBid === undefined };
}

const N = parseInt(process.argv[2] || "2000", 10);
const personality = (process.argv[3] || "hard-3") as AIPersonality;
const seats: AIPersonality[] = [personality, personality, personality, personality, personality];

// Caller net score this game given a hypothetical uniform "bid boost" δ.
// Capture C is bid-independent, so the caller would make δ iff C ≥ bid0+δ.
const evAt = (games: { bid: number; capture: number }[], delta: number) =>
  games.reduce((s, g) => { const b = Math.min(300, g.bid + delta); return s + (g.capture >= b ? b : -b); }, 0) / games.length;

console.log(`\n${N} games per row · all-${personality}\n`);
console.log("shuffle      | games | avg-bid | avg-cap | gap | made% | curEV | bestΔ | bestEV | made%@best");
console.log("-".repeat(96));
for (const [label, intensity] of [["Chaos", 0], ["Fun", 0.33], ["Standard", 0.66], ["Uniform", 1]] as [string, number][]) {
  const games: { bid: number; capture: number }[] = [];
  for (let i = 0; i < N; i++) { const g = runOneGame(seats, intensity); if (g) games.push(g); }
  const n = games.length;
  const avg = (f: (g: { bid: number; capture: number }) => number) => (games.reduce((s, g) => s + f(g), 0) / n).toFixed(1);
  const madePct = (delta: number) => (games.filter((g) => g.capture >= Math.min(300, g.bid + delta)).length / n * 100).toFixed(1);
  let bestD = 0, bestEV = -1e9;
  for (let d = 0; d <= 100; d += 5) { const ev = evAt(games, d); if (ev > bestEV) { bestEV = ev; bestD = d; } }
  console.log(
    `${label.padEnd(12)} | ${String(n).padStart(5)} | ${avg((g) => g.bid).padStart(7)} | ${avg((g) => g.capture).padStart(7)} | ${avg((g) => g.capture - g.bid).padStart(4)} | ${madePct(0).padStart(5)} | ${evAt(games, 0).toFixed(1).padStart(6)} | ${("+" + bestD).padStart(5)} | ${bestEV.toFixed(1).padStart(6)} | ${madePct(bestD).padStart(6)}`,
  );
}
