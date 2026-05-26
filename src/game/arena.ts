// =============================================================================
//  Arena — mixed-personality bench. No UI.
//
//  Plays N games. Each seat gets a personality from a configurable distribution.
//  Tracks for every personality: games played, times caller, call-success rate,
//  and overall team-win rate (= fraction of games where this personality ended
//  up on the side that scored positively).
//
//  Run examples:
//      npx tsx src/game/arena.ts 2000
//      npx tsx src/game/arena.ts 2000 hard,normal
//      npx tsx src/game/arena.ts 5000 hard,normal,hard,normal,hard   (fixed seat layout)
// =============================================================================

import { freshGame, applyBid, applyPass, applyDeclare, applyPlay, collectTrick } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { legalPlays } from "./rules";
import { AIPersonality, GameState, PlayerId } from "./types";

type Personality = AIPersonality;

interface SeatStats {
  games: number;
  timesCaller: number;
  callsMade: number;
  callsFailed: number;
  /** Times this personality finished on the team that scored positively (made bid + partners, OR opponents when bid failed). */
  teamWins: number;
  /** Sum of winning bids (when this personality was caller) — for avg-bid-when-caller stat. */
  bidSumAsCaller: number;
  /** When this personality was caller, accumulate captured points by their team. */
  captureSumAsCaller: number;
}

function newStats(): SeatStats {
  return {
    games: 0, timesCaller: 0, callsMade: 0, callsFailed: 0, teamWins: 0,
    bidSumAsCaller: 0, captureSumAsCaller: 0,
  };
}

function runOneGame(seats: Personality[]): {
  callerSeat: PlayerId | undefined;
  callerMade: boolean;
  winningSeats: Set<PlayerId>;
  bid: number | undefined;
  capture: number;
} {
  let s = freshGame(
    seats.map((p, i) => ({ name: `P${i}`, isAI: true, aiPersonality: p })),
    300,
  );
  let safety = 0;
  while (s.phase !== "game_end") {
    if (safety++ > 100000) throw new Error("Stuck game");
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
        // Legality assertion (safety net) — every personality must respect follow-suit.
        const legal = legalPlays(s.round.hands[s.round.toPlay], s.round.currentTrick);
        if (!legal.some((c) => c.id === card.id)) {
          throw new Error(`Illegal play by ${seats[s.round.toPlay]} at seat ${s.round.toPlay}`);
        }
        s = applyPlay(s, s.round.toPlay, card);
      }
    } else {
      throw new Error("Unhandled phase " + r.phase);
    }
  }
  const final = s as GameState;
  const r = final.round;
  if (r.bidder === undefined) {
    return { callerSeat: undefined, callerMade: false, winningSeats: new Set(), bid: undefined, capture: 0 };
  }
  const team = new Set<PlayerId>([r.bidder, ...(r.partners ?? [])]);
  const teamCapture = ([0, 1, 2, 3, 4] as PlayerId[])
    .filter((p) => team.has(p))
    .reduce<number>((acc, p) => acc + (r.roundPoints?.[p] ?? 0), 0);
  const callerMade = teamCapture >= (r.winningBid ?? 0);
  // Winning side is caller team if they made it, else the opposition.
  const winningSeats = new Set<PlayerId>();
  for (const p of [0, 1, 2, 3, 4] as PlayerId[]) {
    const onTeam = team.has(p);
    if (callerMade ? onTeam : !onTeam) winningSeats.add(p);
  }
  return { callerSeat: r.bidder, callerMade, winningSeats, bid: r.winningBid, capture: teamCapture };
}

function pickRandomSeats(personalities: Personality[]): Personality[] {
  const out: Personality[] = [];
  for (let i = 0; i < 5; i++) out.push(personalities[Math.floor(Math.random() * personalities.length)]);
  return out;
}

function fmtPct(n: number, d: number): string { return d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`; }
function fmtAvg(sum: number, n: number, digits = 1): string { return n === 0 ? "—" : (sum / n).toFixed(digits); }

function summarize(perSeat: Record<Personality, SeatStats>, totalGames: number) {
  console.log(`\nArena summary (${totalGames} games):`);
  console.log("personality   |  played  |  called  | call-made% | avg-bid | avg-cap | team-win%");
  console.log("-".repeat(86));
  for (const key of ["hard", "normal", "random"] as Personality[]) {
    const s = perSeat[key];
    if (!s || s.games === 0) continue;
    console.log(
      `${key.padEnd(13)} | ${String(s.games).padStart(8)} | ${String(s.timesCaller).padStart(8)} | ${fmtPct(s.callsMade, s.callsMade + s.callsFailed).padStart(10)} | ${fmtAvg(s.bidSumAsCaller, s.timesCaller).padStart(7)} | ${fmtAvg(s.captureSumAsCaller, s.timesCaller).padStart(7)} | ${fmtPct(s.teamWins, s.games).padStart(8)}`,
    );
  }
}

const N = parseInt(process.argv[2] || "2000", 10);
const arg = process.argv[3] || "hard,normal";
const tokens = arg.split(",").map((t) => t.trim()) as Personality[];
const fixedLayout = tokens.length === 5;

const perSeat: Record<Personality, SeatStats> = {
  hard: newStats(), normal: newStats(), random: newStats(),
};

const t0 = Date.now();
let illegal = 0;
for (let i = 0; i < N; i++) {
  const seats: Personality[] = fixedLayout ? tokens : pickRandomSeats(tokens);
  let result;
  try {
    result = runOneGame(seats);
  } catch (e) {
    illegal++;
    if (illegal < 3) console.error("Game error:", (e as Error).message);
    continue;
  }
  for (let seat = 0 as PlayerId; seat < 5; seat = (seat + 1) as PlayerId) {
    const p = seats[seat];
    const s = perSeat[p];
    s.games++;
    if (result.callerSeat === seat) {
      s.timesCaller++;
      s.bidSumAsCaller += result.bid ?? 0;
      s.captureSumAsCaller += result.capture;
      if (result.callerMade) s.callsMade++; else s.callsFailed++;
    }
    if (result.winningSeats.has(seat)) s.teamWins++;
  }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nLayout: ${fixedLayout ? tokens.join(",") : `random mix of [${tokens.join(",")}]`}`);
console.log(`Ran ${N} games in ${elapsed}s (${(N / parseFloat(elapsed)).toFixed(0)} games/sec). ${illegal} errors.`);
summarize(perSeat, N);
