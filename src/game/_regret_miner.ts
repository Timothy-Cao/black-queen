// Counterfactual regret miner — a DATA-DRIVEN census of a bot's systematic
// mistakes, to drive sound "dominance guardrails" (see docs/ai_roster.md and the
// deep-dive on overcoming the Elo wall).
//
// Idea: for each PLAY decision the focal bot makes in self-play, we know the deal
// (god-view, for analysis only). For each LEGAL alternative we replay the rest of
// the game deal-fixed with a fixed greedy policy for everyone, to a final score,
// and take the focal team's value. regret(chosen) = best_alt_value - chosen_value.
//
// We bucket each decision by INFORMATION-SET features (what the bot could know)
// and report, per bucket: mean regret + the fraction of decisions where an
// alternative was strictly better. A bucket with high mean regret AND a high
// "alt-better fraction" is a *dominated-move pattern* → a safe guardrail candidate
// (sound: better in (almost) all sampled worlds). A bucket where regret is only
// positive-on-average is a heuristic, NOT safe to hard-code.
//
// Usage: HARD4_TIME_MS=80 npx tsx src/game/_regret_miner.ts 150 hard-4 docs/regret/out.json

import { mkdirSync, writeFileSync } from "fs";
import { applyBid, applyDeclare, applyPass, applyPlay, collectTrick, freshGame } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { legalPlays, trickWinner, trickPoints } from "./rules";
import { AIPersonality, Card, GameState, PlayerId, PLAYER_IDS, Suit, cardPoints } from "./types";
import { DEFAULT_HARD_WEIGHTS, HardWeights, setActiveHardWeights, setGen2HardWeights } from "./aiHard";
import { warmWasm } from "./hard4Driver";
import gen2Weights from "./tuned_weights_gen2.json";
import gen3Weights from "./tuned_weights_gen3.json";

setGen2HardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen2Weights } as HardWeights);
setActiveHardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen3Weights } as HardWeights);
await warmWasm();

// ---- fixed greedy continuation policy (deal-fixed counterfactual rollout) ----
function greedyPick(state: GameState, p: PlayerId): Card {
  const r = state.round;
  const trick = r.currentTrick!;
  const legal = legalPlays(r.hands[p], trick);
  if (legal.length === 1) return legal[0];
  if (!trick || trick.plays.length === 0) {
    // lead: lowest non-trump, else lowest
    const nonTrump = legal.filter((c) => c.suit !== r.trump);
    const pool = nonTrump.length ? nonTrump : legal;
    return pool.reduce((a, b) => (a.rank <= b.rank ? a : b));
  }
  const led = trick.plays[0].card.suit;
  const curWinner = trickWinner(trick, r.trump);
  const pts = trickPoints(trick);
  // can I beat the current winner?
  const beats = legal.filter((c) => {
    const hypo = { ...trick, plays: [...trick.plays, { player: p, card: c }] };
    return trickWinner(hypo, r.trump) === p;
  });
  if (beats.length && pts >= 10) {
    // take cheaply (non-trump winner preferred)
    const nt = beats.filter((c) => c.suit !== r.trump);
    const pool = nt.length ? nt : beats;
    return pool.reduce((a, b) => (cardPoints(a) - a.rank / 100 <= cardPoints(b) - b.rank / 100 ? a : b));
  }
  // else dump cheapest non-trump
  const nonTrump = legal.filter((c) => c.suit !== r.trump);
  const pool = nonTrump.length ? nonTrump : legal;
  return pool.reduce((a, b) => {
    const ka = cardPoints(a) * 100 + a.rank, kb = cardPoints(b) * 100 + b.rank;
    return ka <= kb ? a : b;
  });
}

// Play the rest of the game from `state` (must be in playing phase) with greedy
// for all seats, return final caller-team captured points.
function greedyPlayout(state: GameState): number {
  let s = state;
  let safety = 0;
  while (s.phase !== "game_end" && s.round.phase !== "round_end") {
    if (safety++ > 5000) break;
    const r = s.round;
    if (r.pendingTrickComplete) { s = collectTrick(s); continue; }
    if (r.phase !== "playing") break;
    s = applyPlay(s, r.toPlay, greedyPick(s, r.toPlay));
  }
  const r = s.round;
  const team = new Set<PlayerId>([r.bidder as PlayerId, ...(r.partners ?? [])]);
  return PLAYER_IDS.filter((p) => team.has(p)).reduce((sum, p) => sum + (r.roundPoints?.[p] ?? 0), 0);
}

// info-set feature bucket key for a focal play decision.
function bucketKey(state: GameState, focal: PlayerId, chosen: Card, legal: Card[]): string {
  const r = state.round;
  const trick = r.currentTrick!;
  const team = new Set<PlayerId>([r.bidder as PlayerId, ...(r.partners ?? [])]);
  const focalCaller = team.has(focal);
  const role = focal === r.bidder ? "caller" : focalCaller ? "partner" : "defender";
  const leading = !trick || trick.plays.length === 0;
  const led = leading ? null : trick.plays[0].card.suit;
  const status = leading ? "lead" : chosen.suit === led ? "follow" : chosen.suit === r.trump ? "trump" : "discard";
  let winSit = "n/a";
  if (!leading) {
    const w = trickWinner(trick, r.trump);
    winSit = team.has(w) === focalCaller ? "ally-winning" : "enemy-winning";
  }
  const chosePoints = cardPoints(chosen) > 0;
  const cheaperExists = legal.some((c) => cardPoints(c) < cardPoints(chosen) && c.suit !== r.trump && c.suit !== led);
  return `${role}|${status}|${winSit}|chosePts=${chosePoints}|cheaper=${cheaperExists}`;
}

// ---- run ----
const argv = process.argv;
const N = parseInt(argv[2] ?? "150", 10);
const focalBot = (argv[3] ?? "hard-4") as AIPersonality;
const outPath = argv[4] ?? "docs/regret/regret.json";
mkdirSync(outPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });

const seats: AIPersonality[] = [focalBot, "hard-3", "hard-2", "hard", "hard-3"];
type Bucket = { n: number; sumRegret: number; altBetter: number; examples: string[] };
const buckets = new Map<string, Bucket>();
let decisions = 0;
const t0 = Date.now();

for (let g = 0; g < N; g++) {
  const seed = 40_000_000 + g;
  const oldRandom = Math.random;
  let t = (seed >>> 0);
  Math.random = () => { t += 0x6D2B79F5; let x = Math.imul(t ^ (t >>> 15), t | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  try {
    let state = freshGame(seats.map((p, i) => ({ name: `P${i}`, isAI: true, aiPersonality: p })), 300, "light", 0, false);
    let safety = 0;
    while (state.phase !== "game_end") {
      if (safety++ > 10000) break;
      const r = state.round;
      if (r.pendingTrickComplete) { state = collectTrick(state); continue; }
      if (r.phase === "bidding") {
        const p = r.bidTurn!;
        const d = aiBidDecision(state, p);
        state = d.bid === "pass" ? applyPass(state, p) : applyBid(state, p, d.bid);
      } else if (r.phase === "declaring") {
        const d = aiDeclareDecision(state, r.bidder!);
        state = applyDeclare(state, d.trump, d.partnerCard);
      } else if (r.phase === "playing") {
        const p = r.toPlay;
        if (p === 0 /* focal seat */ && r.partnerCard) {
          const trick = r.currentTrick;
          if (trick) {
            const legal = legalPlays(r.hands[p], trick);
            if (legal.length > 1) {
              const team = new Set<PlayerId>([r.bidder as PlayerId, ...(r.partners ?? [])]);
              const focalCaller = team.has(p);
              const chosen = aiPlayDecision(state, p);
              // counterfactual value of each legal move (deal-fixed greedy continuation)
              const valueOf = (m: Card): number => {
                const after = applyPlay(state, p, m);
                const callerPts = greedyPlayout(after.round.pendingTrickComplete ? collectTrick(after) : after);
                return focalCaller ? callerPts : 300 - callerPts;
              };
              const chosenVal = valueOf(chosen);
              let bestVal = chosenVal, bestAltStrictly = false;
              for (const m of legal) {
                if (m.suit === chosen.suit && m.rank === chosen.rank) continue;
                const v = valueOf(m);
                if (v > bestVal) bestVal = v;
                if (v > chosenVal + 4) bestAltStrictly = true; // >4pt better
              }
              const regret = bestVal - chosenVal;
              const key = bucketKey(state, p, chosen, legal);
              const b = buckets.get(key) ?? { n: 0, sumRegret: 0, altBetter: 0, examples: [] };
              b.n++; b.sumRegret += regret; if (bestAltStrictly) b.altBetter++;
              if (regret > 15 && b.examples.length < 3) b.examples.push(`g${g}: chose ${chosen.suit}${chosen.rank} (regret ${regret})`);
              buckets.set(key, b);
              decisions++;
            }
          }
          // apply the actual move and continue
          state = applyPlay(state, p, aiPlayDecision(state, p));
        } else {
          state = applyPlay(state, p, aiPlayDecision(state, p));
        }
      } else break;
    }
  } finally {
    Math.random = oldRandom;
  }
  if ((g + 1) % 25 === 0) console.error(`progress: ${g + 1}/${N} games, ${decisions} decisions, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const rows = Array.from(buckets.entries())
  .map(([key, b]) => ({ key, n: b.n, meanRegret: +(b.sumRegret / b.n).toFixed(2), altBetterPct: +(b.altBetter / b.n * 100).toFixed(1), examples: b.examples }))
  .filter((r) => r.n >= 5)
  .sort((a, b) => b.meanRegret * b.n - a.meanRegret * a.n);

writeFileSync(outPath, JSON.stringify({ focalBot, games: N, decisions, buckets: rows }, null, 2));
console.log(`\n# Regret census — focal=${focalBot}, ${N} games, ${decisions} decisions\n`);
console.log("| info-set bucket | n | mean regret | alt-better% |");
console.log("|---|---:|---:|---:|");
for (const r of rows.slice(0, 18)) console.log(`| ${r.key} | ${r.n} | ${r.meanRegret} | ${r.altBetterPct}% |`);
console.log(`\nwrote ${outPath}. High mean-regret + high alt-better% = dominated-move pattern (guardrail candidate).`);
