// =============================================================================
//  Mirror-replay arena: tightens win-rate signal by removing seat/seed variance.
//
//  For each seed, plays the game twice:
//   1. Seat layout A: [p1, p2, p2, p2, p2]  (one p1 vs four p2)
//   2. Seat layout B: [p2, p1, p1, p1, p1]  (mirror: four p1 vs one p2)
//  By summing per-personality outcomes across the mirror pair, we cancel out
//  the seat-luck noise (some seeds are just better for some seats).
//
//  Usage:
//    npx tsx src/game/_mirror_arena.ts 500 hard-4 hard-3
// =============================================================================

import { freshGame, applyBid, applyPass, applyDeclare, applyPlay, collectTrick } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { AIPersonality, GameState, PlayerId } from "./types";

function runOneGame(seats: AIPersonality[]): { winners: Set<PlayerId>; caller?: PlayerId; bid?: number; made?: boolean } {
  let state: GameState = freshGame(seats.map((p, i) => ({
    name: `P${i}`, isAI: true, aiPersonality: p,
  })));
  let safety = 0;
  while (state.round.phase !== "round_end" && state.round.phase !== "game_end") {
    safety++;
    if (safety > 5000) throw new Error("Stuck game");
    const r = state.round;
    if (r.pendingTrickComplete) { state = collectTrick(state); continue; }
    if (r.phase === "bidding" && r.bidTurn !== undefined) {
      const d = aiBidDecision(state, r.bidTurn);
      state = d.bid === "pass" ? applyPass(state, r.bidTurn) : applyBid(state, r.bidTurn, d.bid);
    } else if (r.phase === "declaring" && r.bidder !== undefined) {
      const d = aiDeclareDecision(state, r.bidder);
      state = applyDeclare(state, d.trump, d.partnerCard);
    } else if (r.phase === "playing") {
      const c = aiPlayDecision(state, r.toPlay);
      state = applyPlay(state, r.toPlay, c);
    }
  }
  const r = state.round;
  const caller = r.bidder;
  const bid = r.winningBid;
  const pts = r.roundPoints!;
  const team = caller !== undefined ? new Set([caller, ...(r.partners ?? [])]) : new Set<PlayerId>();
  const teamPts: number = Array.from(team).reduce<number>((s, p) => s + (pts[p] ?? 0), 0);
  const made = bid !== undefined && teamPts >= bid;
  const winners = new Set<PlayerId>();
  for (const p of [0, 1, 2, 3, 4] as PlayerId[]) {
    const onTeam = team.has(p);
    if ((made && onTeam) || (!made && !onTeam)) winners.add(p);
  }
  return { winners, caller, bid, made };
}

function makeMixedSeats(p1: AIPersonality, p2: AIPersonality, p1Slots: number[]): AIPersonality[] {
  const seats: AIPersonality[] = [p2, p2, p2, p2, p2];
  for (const s of p1Slots) seats[s] = p1;
  return seats;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const argv: string[] = (globalThis as any).process?.argv ?? [];
const N = parseInt(argv[2] || "500", 10);
const p1 = (argv[3] || "hard-4") as AIPersonality;
const p2 = (argv[4] || "hard-3") as AIPersonality;

// Per-personality, per-mirror-pair stats.
let p1Played = 0, p1Wins = 0, p1Called = 0, p1Made = 0;
let p2Played = 0, p2Wins = 0, p2Called = 0, p2Made = 0;

const t0 = Date.now();
let errors = 0;
for (let i = 0; i < N; i++) {
  // Pick a random "1 vs 4" mirror: choose 1 seat for p1; the mirror has 4 seats for p1.
  const seat = i % 5;
  const seatsA = makeMixedSeats(p1, p2, [seat]);                 // 1 p1, 4 p2
  const seatsB = makeMixedSeats(p2, p1, [seat]);                 // 1 p2, 4 p1

  try {
    const ra = runOneGame(seatsA);
    const rb = runOneGame(seatsB);

    for (let s = 0 as PlayerId; s < 5; s = (s + 1) as PlayerId) {
      // Game A.
      const pa = seatsA[s];
      if (pa === p1) {
        p1Played++; if (ra.winners.has(s)) p1Wins++;
        if (ra.caller === s) { p1Called++; if (ra.made) p1Made++; }
      } else {
        p2Played++; if (ra.winners.has(s)) p2Wins++;
        if (ra.caller === s) { p2Called++; if (ra.made) p2Made++; }
      }
      // Game B.
      const pb = seatsB[s];
      if (pb === p1) {
        p1Played++; if (rb.winners.has(s)) p1Wins++;
        if (rb.caller === s) { p1Called++; if (rb.made) p1Made++; }
      } else {
        p2Played++; if (rb.winners.has(s)) p2Wins++;
        if (rb.caller === s) { p2Called++; if (rb.made) p2Made++; }
      }
    }
  } catch (e) {
    errors++;
    if (errors < 3) console.error("err:", (e as Error).message);
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const fmt = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(2)}%`);
console.log(`\nMirror-replay arena: ${N} seed pairs (${N * 2} games), ${elapsed}s, ${errors} errors`);
console.log(`p1 = ${p1},  p2 = ${p2}`);
console.log("");
console.log(`personality   |  seats  | team-win% | calls | call-made%`);
console.log("-".repeat(60));
console.log(`${p1.padEnd(13)} | ${String(p1Played).padStart(7)} | ${fmt(p1Wins, p1Played).padStart(8)} | ${String(p1Called).padStart(5)} | ${fmt(p1Made, p1Called).padStart(9)}`);
console.log(`${p2.padEnd(13)} | ${String(p2Played).padStart(7)} | ${fmt(p2Wins, p2Played).padStart(8)} | ${String(p2Called).padStart(5)} | ${fmt(p2Made, p2Called).padStart(9)}`);
console.log("");
const edge = ((p1Wins / Math.max(1, p1Played)) - (p2Wins / Math.max(1, p2Played))) * 100;
console.log(`Edge: ${p1} ${edge >= 0 ? "+" : ""}${edge.toFixed(2)}pp vs ${p2}`);
