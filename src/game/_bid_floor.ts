// Tests the "a partner carries you" hypothesis: if a player OPENS at the minimum
// 150 (choosing trump + partner via the hard-3 declare heuristic) and the game is
// played out by all hard-3, how often does their team capture >= 150 — and does it
// hold up even for weak hands?
//
// For each deal we force EACH of the 5 seats, in turn, to be the sole caller at 150
// (everyone else passes), then play it out. We bucket by the caller's own hand
// points (Q.S=30, A=15, 10=10, 5=5; 300 in the deck, avg 60/hand).
//
//   npx tsx src/game/_bid_floor.ts 1500
import { freshGame, applyBid, applyPass, applyDeclare, applyPlay, collectTrick } from "./engine";
import { aiDeclareDecision, aiPlayDecision } from "./ai";
import { AIPersonality, GameState, PlayerId, cardPoints, Card } from "./types";

const P: AIPersonality = "hard-3";
const seats: AIPersonality[] = [P, P, P, P, P];
const handPts = (h: Card[]) => h.reduce((s, c) => s + cardPoints(c), 0);

// Force `caller` to win the auction at 150; everyone else passes. Returns the
// declaring-phase state, or null if the engine didn't cooperate.
function forceOpen(base: GameState, caller: PlayerId): GameState | null {
  let s = base;
  let guard = 0;
  while (s.round.phase === "bidding") {
    if (guard++ > 50) return null;
    const t = s.round.bidTurn!;
    if (t === caller && Math.max(0, ...s.round.bids.map((b) => b.amount)) === 0) {
      s = applyBid(s, t, 150);
    } else {
      s = applyPass(s, t);
    }
  }
  return s.round.bidder === caller ? s : null;
}

function playOut(declState: GameState): number | null {
  const d = aiDeclareDecision(declState, declState.round.bidder!);
  let s = applyDeclare(declState, d.trump, d.partnerCard);
  let guard = 0;
  while (s.phase !== "game_end") {
    if (guard++ > 100000) return null;
    const r = s.round;
    if (r.pendingTrickComplete) s = collectTrick(s);
    else s = applyPlay(s, r.toPlay, aiPlayDecision(s, r.toPlay));
  }
  const r = (s as GameState).round;
  const team = new Set<PlayerId>([r.bidder!, ...(r.partners ?? [])]);
  return ([0, 1, 2, 3, 4] as PlayerId[]).filter((p) => team.has(p)).reduce<number>((a, p) => a + (r.roundPoints?.[p] ?? 0), 0);
}

const N = parseInt(process.argv[2] || "1500", 10);
const buckets = [
  { label: "terrible (<35)", lo: 0, hi: 35 },
  { label: "weak (35-50)", lo: 35, hi: 50 },
  { label: "avg (50-70)", lo: 50, hi: 70 },
  { label: "good (70-90)", lo: 70, hi: 90 },
  { label: "strong (90+)", lo: 90, hi: 999 },
];
const THRESH = [150, 170, 185, 200, 215];
const stat = buckets.map(() => ({ n: 0, made150: 0, capSum: 0, makeAt: THRESH.map(() => 0) }));

for (let i = 0; i < N; i++) {
  const base = freshGame(seats.map((p, k) => ({ name: `P${k}`, isAI: true, aiPersonality: p })), 300, "light", 1.0);
  for (let seat = 0 as PlayerId; seat < 5; seat = (seat + 1) as PlayerId) {
    const opened = forceOpen(base, seat);
    if (!opened) continue;
    const myPts = handPts(base.round.hands[seat]);
    const cap = playOut(opened);
    if (cap === null) continue;
    const b = buckets.findIndex((x) => myPts >= x.lo && myPts < x.hi);
    if (b < 0) continue;
    stat[b].n++;
    stat[b].capSum += cap;
    if (cap >= 150) stat[b].made150++;
    THRESH.forEach((t, ti) => { if (cap >= t) stat[b].makeAt[ti]++; });
  }
}

console.log(`\nForced-open · all-${P} · Uniform shuffle · ${N} deals (x5 seats)`);
console.log(`make% by opening level — EV-optimal open level maximizes b*(2*make%-1)\n`);
console.log(`caller hand     | trials | avg cap | ${THRESH.map((t) => `m${t}`).join("  ")}`);
console.log("-".repeat(70));
const fmt = (n: number, d: number) => `${((n / d) * 100).toFixed(0)}%`.padStart(4);
buckets.forEach((bk, i) => {
  const s = stat[i];
  if (!s.n) return;
  console.log(`${bk.label.padEnd(15)} | ${String(s.n).padStart(6)} | ${(s.capSum / s.n).toFixed(0).padStart(7)} | ${s.makeAt.map((m) => fmt(m, s.n)).join(" ")}`);
});
// Best-EV open level overall.
const tot = THRESH.map((_, ti) => stat.reduce((a, s) => a + s.makeAt[ti], 0));
const totN = stat.reduce((a, s) => a + s.n, 0);
console.log("-".repeat(70));
console.log("EV by open level (overall):");
THRESH.forEach((t, ti) => {
  const p = tot[ti] / totN;
  console.log(`  open ${t}: make ${(p * 100).toFixed(1)}%  EV ${(t * (2 * p - 1)).toFixed(1)}`);
});
