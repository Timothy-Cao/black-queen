// A/B for the partner-carry bid floor. Each game randomly assigns each of the 5
// seats to FLOOR (bidPartnerCarryFloor = F) or BASE (0). Declare + play are
// identical (active gen-3 weights) for every seat, so the only difference is
// bidding. We compare the two groups' average net score (= deltaScores, since
// defenders score 0) and how often each group is the caller / wins.
//
//   npx tsx src/game/_carry_ab.ts 4000 165
import { existsSync, readFileSync } from "fs";
import { freshGame, applyBid, applyPass, applyDeclare, applyPlay, collectTrick } from "./engine";
import { hardBidWith, hardTunedDeclare, hardTunedPlay, getActiveHardWeights, setActiveHardWeights, DEFAULT_HARD_WEIGHTS, HardWeights } from "./aiHard";
import { GameState, PlayerId } from "./types";

if (existsSync("./tuned_weights.json")) {
  try { setActiveHardWeights({ ...DEFAULT_HARD_WEIGHTS, ...JSON.parse(readFileSync("./tuned_weights.json", "utf8")) }); }
  catch { /* keep defaults */ }
}
const N = parseInt(process.argv[2] || "4000", 10);
const F = parseInt(process.argv[3] || "165", 10);
const intensity = process.argv[4] !== undefined ? Number(process.argv[4]) : 1.0;

const base = getActiveHardWeights();
const wBase: HardWeights = { ...base, bidPartnerCarryFloor: 0 };
const wFloor: HardWeights = { ...base, bidPartnerCarryFloor: F };

const acc = {
  floor: { net: 0, seats: 0, callers: 0, pos: 0 },
  basel: { net: 0, seats: 0, callers: 0, pos: 0 },
};

for (let i = 0; i < N; i++) {
  const floored = [0, 1, 2, 3, 4].map(() => Math.random() < 0.5) as boolean[];
  let s: GameState = freshGame([0, 1, 2, 3, 4].map((k) => ({ name: `P${k}`, isAI: true, aiPersonality: "hard-3" as const })), 300, "light", intensity);
  let guard = 0;
  while (s.phase !== "game_end") {
    if (guard++ > 100000) break;
    const r = s.round;
    if (r.phase === "bidding") {
      const t = r.bidTurn!;
      const d = hardBidWith(s, t, floored[t] ? wFloor : wBase);
      s = d.bid === "pass" ? applyPass(s, t) : applyBid(s, t, d.bid);
    } else if (r.phase === "declaring") {
      const d = hardTunedDeclare(s, r.bidder!);
      s = applyDeclare(s, d.trump, d.partnerCard);
    } else if (r.phase === "playing") {
      if (r.pendingTrickComplete) s = collectTrick(s);
      else s = applyPlay(s, r.toPlay, hardTunedPlay(s, r.toPlay));
    }
  }
  const r = s.round;
  const caller = r.bidder;
  for (const seat of [0, 1, 2, 3, 4] as PlayerId[]) {
    const g = floored[seat] ? acc.floor : acc.basel;
    g.seats++;
    const delta = r.deltaScores?.[seat] ?? 0;
    g.net += delta;
    if (delta > 0) g.pos++;
    if (caller === seat) g.callers++;
  }
}

const row = (label: string, g: { net: number; seats: number; callers: number; pos: number }) =>
  `${label.padEnd(8)} | ${String(g.seats).padStart(6)} | ${(g.net / g.seats).toFixed(2).padStart(8)} | ${((g.callers / g.seats) * 100).toFixed(1).padStart(7)}% | ${((g.pos / g.seats) * 100).toFixed(1).padStart(7)}%`;

console.log(`\nCarry-floor A/B · gen-3 weights · intensity ${intensity} · floor=${F} · ${N} games\n`);
console.log("group    | seats  | avg net  | caller% | win(+)%");
console.log("-".repeat(52));
console.log(row("FLOOR", acc.floor));
console.log(row("BASE", acc.basel));
console.log("-".repeat(52));
const dNet = acc.floor.net / acc.floor.seats - acc.basel.net / acc.basel.seats;
console.log(`\nFLOOR − BASE avg net score: ${dNet >= 0 ? "+" : ""}${dNet.toFixed(2)} per seat-game`);
