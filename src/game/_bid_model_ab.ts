// Compares two bid-target policies head-to-head (mixed seats, same games):
//   FLOOR(F): target = max(capacityTarget, F)          [the shipped model]
//   ADD(K):   target = capacityTarget + K               [scales with hand strength]
// Declare + play are identical (active gen-3 weights). We report each policy's
// avg net score (= deltaScores; defenders score 0), caller share, and win+ rate.
//
//   npx tsx src/game/_bid_model_ab.ts 6000 1.0 floor:185 add:70
import { existsSync, readFileSync } from "fs";
import { freshGame, applyBid, applyPass, applyDeclare, applyPlay, collectTrick } from "./engine";
import { estimateBidCapacity, hardTunedDeclare, hardTunedPlay, getActiveHardWeights, setActiveHardWeights, DEFAULT_HARD_WEIGHTS } from "./aiHard";
import { GameState, PlayerId, MIN_BID, BID_INCREMENT } from "./types";

if (existsSync("./tuned_weights.json")) {
  try { setActiveHardWeights({ ...DEFAULT_HARD_WEIGHTS, ...JSON.parse(readFileSync("./tuned_weights.json", "utf8")) }); } catch { /* */ }
}
const N = parseInt(process.argv[2] || "6000", 10);
const intensity = process.argv[3] !== undefined ? Number(process.argv[3]) : 1.0;
const parse = (tok: string, d: number) => { const a = (process.argv.find((x) => x.startsWith(tok + ":")) || "").split(":")[1]; return a ? Number(a) : d; };
const F = parse("floor", 185);
const K = parse("add", 70);

const w = getActiveHardWeights();
const round5 = (x: number) => Math.floor(x / 5) * 5;

// Returns the bid (number or "pass") for a policy given current auction state.
function decide(s: GameState, seat: PlayerId, policy: "floor" | "add"): number | "pass" {
  const hand = s.round.hands[seat];
  const capacity = estimateBidCapacity(hand, w);
  const currentHigh = Math.max(0, ...s.round.bids.map((b) => b.amount));
  const required = currentHigh === 0 ? MIN_BID : currentHigh + BID_INCREMENT;
  let target = round5(capacity);
  if (policy === "floor") target = Math.max(target, round5(F));
  else target = round5(capacity + K);
  if (target > w.bidCap && capacity < w.bidCapExtraordinary) target = Math.round(w.bidCap);
  if (target > 300) target = 300;
  if (required > target) return "pass";
  if (Math.random() < 0.05 && required > MIN_BID) return "pass";
  return required;
}

const acc = { floor: { net: 0, n: 0, callers: 0, pos: 0 }, add: { net: 0, n: 0, callers: 0, pos: 0 } };

for (let i = 0; i < N; i++) {
  const pol = [0, 1, 2, 3, 4].map(() => (Math.random() < 0.5 ? "floor" : "add")) as ("floor" | "add")[];
  let s: GameState = freshGame([0, 1, 2, 3, 4].map((k) => ({ name: `P${k}`, isAI: true, aiPersonality: "hard-3" as const })), 300, "light", intensity);
  let guard = 0;
  while (s.phase !== "game_end") {
    if (guard++ > 100000) break;
    const r = s.round;
    if (r.phase === "bidding") {
      const t = r.bidTurn!;
      const d = decide(s, t, pol[t]);
      s = d === "pass" ? applyPass(s, t) : applyBid(s, t, d);
    } else if (r.phase === "declaring") {
      const d = hardTunedDeclare(s, r.bidder!);
      s = applyDeclare(s, d.trump, d.partnerCard);
    } else if (r.phase === "playing") {
      if (r.pendingTrickComplete) s = collectTrick(s);
      else s = applyPlay(s, r.toPlay, hardTunedPlay(s, r.toPlay));
    }
  }
  const r = s.round;
  for (const seat of [0, 1, 2, 3, 4] as PlayerId[]) {
    const g = acc[pol[seat]];
    g.n++;
    const delta = r.deltaScores?.[seat] ?? 0;
    g.net += delta;
    if (delta > 0) g.pos++;
    if (r.bidder === seat) g.callers++;
  }
}

const row = (label: string, g: { net: number; n: number; callers: number; pos: number }) =>
  `${label.padEnd(11)} | ${String(g.n).padStart(6)} | ${(g.net / g.n).toFixed(2).padStart(8)} | ${((g.callers / g.n) * 100).toFixed(1).padStart(7)}% | ${((g.pos / g.n) * 100).toFixed(1).padStart(7)}%`;
console.log(`\nBid-model A/B · gen-3 · intensity ${intensity} · FLOOR(${F}) vs ADD(${K}) · ${N} games\n`);
console.log("policy      | seats  | avg net  | caller% | win(+)%");
console.log("-".repeat(54));
console.log(row(`FLOOR ${F}`, acc.floor));
console.log(row(`ADD ${K}`, acc.add));
console.log("-".repeat(54));
const d = acc.add.net / acc.add.n - acc.floor.net / acc.floor.n;
console.log(`\nADD − FLOOR avg net: ${d >= 0 ? "+" : ""}${d.toFixed(2)} per seat-game`);
