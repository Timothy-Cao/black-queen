// =============================================================================
//  Mixed-AI observer trace.
//
//  Runs full games through the real TypeScript AI dispatcher, including true
//  Hard / Hard-2 / Hard-3 and Hard-4 WASM play. Writes readable traces for
//  qualitative review of concrete mistakes.
//
//  Usage:
//    HARD4_TIME_MS=80 npx tsx src/game/_observe_games.ts 5 4242 hard,hard-2,hard-3,hard-4
// =============================================================================

import { mkdirSync, writeFileSync } from "fs";
import { applyBid, applyDeclare, applyPass, applyPlay, cardLabel, collectTrick, freshGame } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { legalPlays, trickPoints, trickWinner } from "./rules";
import {
  AIPersonality,
  Card,
  GameState,
  PlayerId,
  PLAYER_IDS,
  Rank,
  RANK_LABEL,
  Suit,
  SUIT_GLYPHS,
  cardPoints,
} from "./types";
import { DEFAULT_HARD_WEIGHTS, HardWeights, setActiveHardWeights, setGen2HardWeights } from "./aiHard";
import gen2Weights from "./tuned_weights_gen2.json";
import gen3Weights from "./tuned_weights_gen3.json";

setGen2HardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen2Weights } as HardWeights);
setActiveHardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen3Weights } as HardWeights);

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function withSeededRandom<T>(seed: number, fn: () => T): T {
  const oldRandom = Math.random;
  Math.random = mulberry32(seed);
  try { return fn(); }
  finally { Math.random = oldRandom; }
}

function choose<T>(rng: Rng, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function randomSeats(seed: number, pool: AIPersonality[]): AIPersonality[] {
  const rng = mulberry32(seed);
  return PLAYER_IDS.map(() => choose(rng, pool));
}

function handBySuit(hand: Card[]): string {
  const by: Record<Suit, Rank[]> = { S: [], H: [], D: [], C: [] };
  for (const c of hand) by[c.suit].push(c.rank);
  return (["S", "H", "D", "C"] as Suit[])
    .filter((s) => by[s].length > 0)
    .map((s) => `${SUIT_GLYPHS[s]}${by[s].sort((a, b) => b - a).map((r) => RANK_LABEL[r]).join("")}`)
    .join(" ");
}

function cardList(cards: Card[]): string {
  return cards.map(cardLabel).join(" ");
}

function isPartnerCard(state: GameState, card: Card): boolean {
  const pc = state.round.partnerCard;
  return !!pc && pc.suit === card.suit && pc.rank === card.rank;
}

function knownTeamAtEnd(state: GameState): Set<PlayerId> {
  const r = state.round;
  return new Set<PlayerId>([r.bidder!, ...(r.partners ?? [])]);
}

function finalTeamPoints(state: GameState): number {
  const team = knownTeamAtEnd(state);
  return PLAYER_IDS.filter((p) => team.has(p)).reduce((sum, p) => sum + (state.round.roundPoints?.[p] ?? 0), 0);
}

function annotatePlayBefore(state: GameState, player: PlayerId, card: Card, legal: Card[]): string[] {
  const r = state.round;
  const trick = r.currentTrick;
  const notes: string[] = [];
  if (!trick || trick.plays.length === 0) return notes;
  const led = trick.plays[0].card.suit;
  const currentWinner = trickWinner(trick, r.trump);
  const status = card.suit === led ? "follow" : card.suit === r.trump ? "TRUMP" : "discard";
  const pointAlts = legal.filter((c) => cardPoints(c) < cardPoints(card));
  const zeroAlts = legal.filter((c) => cardPoints(c) === 0 && c.suit !== r.trump);
  if (status === "discard" && cardPoints(card) > 0 && zeroAlts.length > 0) {
    notes.push(`FLAG point discard: ${cardLabel(card)} (${cardPoints(card)} pts), zero non-trump alts ${cardList(zeroAlts)}`);
  } else if (status === "discard" && cardPoints(card) > 0 && pointAlts.length > 0) {
    notes.push(`FLAG expensive discard: ${cardLabel(card)} (${cardPoints(card)} pts), cheaper alts ${cardList(pointAlts)}`);
  }
  if (status === "discard" && card.suit === r.trump && cardPoints(card) === 0) {
    notes.push("FLAG trump used as discard");
  }
  if (isPartnerCard(state, card) && player !== r.bidder) {
    notes.push("partner reveal");
  }
  notes.push(`current winner before play: P${currentWinner}, table pts ${trickPoints(trick)}`);
  return notes;
}

function playOneTrace(seats: AIPersonality[], seed: number): string {
  return withSeededRandom(seed, () => {
    let state = freshGame(
      seats.map((p, i) => ({ name: `P${i}`, isAI: true, aiPersonality: p })),
      300,
      "light",
      0,
      false,
    );
    const out: string[] = [];
    out.push("=== GAME ===");
    out.push(`seed=${seed}  seats=${seats.map((p, i) => `P${i}:${p}`).join(" ")}`);
    out.push("");
    out.push("INITIAL HANDS:");
    for (const p of PLAYER_IDS) out.push(`  P${p} (${seats[p].padEnd(6)}): ${handBySuit(state.round.hands[p])}`);
    out.push("");
    out.push("BIDDING:");

    let trickNo = 1;
    let safety = 0;
    while (state.phase !== "game_end") {
      if (safety++ > 10000) throw new Error("stuck game");
      const r = state.round;
      if (r.pendingTrickComplete) {
        const t = r.currentTrick!;
        const winner = t.winner!;
        const winCard = t.plays.find((p) => p.player === winner)!.card;
        out.push(`    -> WINNER P${winner} with ${cardLabel(winCard)} · trick points ${t.points}`);
        out.push("");
        state = collectTrick(state);
        continue;
      }
      if (r.phase === "bidding") {
        const p = r.bidTurn!;
        const d = aiBidDecision(state, p);
        out.push(`  P${p} (${seats[p]}) ${d.bid === "pass" ? "passes" : `bids ${d.bid}`}`);
        state = d.bid === "pass" ? applyPass(state, p) : applyBid(state, p, d.bid);
      } else if (r.phase === "declaring") {
        const caller = r.bidder!;
        const d = aiDeclareDecision(state, caller);
        out.push(`  -> CALLER P${caller} (${seats[caller]}) at ${r.winningBid}`);
        const partners = PLAYER_IDS.filter((p) =>
          p !== caller && r.hands[p].some((c) => c.suit === d.partnerCard.suit && c.rank === d.partnerCard.rank),
        );
        out.push("");
        out.push("DECLARE:");
        out.push(`  P${caller} declares trump=${SUIT_GLYPHS[d.trump]}, partner-card=${cardLabel(d.partnerCard)} (hidden partners: ${partners.length ? partners.map((p) => `P${p}`).join(" ") : "none"})`);
        out.push("");
        out.push("TRICKS:");
        state = applyDeclare(state, d.trump, d.partnerCard);
      } else if (r.phase === "playing") {
        const p = r.toPlay;
        if (!r.currentTrick || r.currentTrick.plays.length === 0) {
          out.push(`  -- Trick ${trickNo++} (led by P${p}) --`);
        }
        const legal = legalPlays(r.hands[p], r.currentTrick);
        const card = aiPlayDecision(state, p);
        if (!legal.some((c) => c.id === card.id)) {
          throw new Error(`illegal play by P${p} ${seats[p]}: ${cardLabel(card)}`);
        }
        const trick = r.currentTrick;
        const led = trick?.plays[0]?.card.suit;
        const status = !trick || trick.plays.length === 0 ? "lead"
          : card.suit === led ? "follow"
          : card.suit === r.trump ? "TRUMP"
          : "discard";
        const alts = legal.filter((c) => c.id !== card.id);
        out.push(`    P${p} (${seats[p]}) ${cardLabel(card)} [${status}] (${legal.length === 1 ? "forced" : `from ${legal.length} legal · alts: ${cardList(alts)}`})`);
        for (const note of annotatePlayBefore(state, p, card, legal)) out.push(`      note: ${note}`);
        state = applyPlay(state, p, card);
      } else {
        throw new Error(`unhandled phase ${r.phase}`);
      }
    }

    const r = state.round;
    const team = knownTeamAtEnd(state);
    const teamPts = finalTeamPoints(state);
    const made = teamPts >= (r.winningBid ?? 0);
    out.push("FINAL:");
    out.push(`  Caller P${r.bidder} team: ${Array.from(team).map((p) => `P${p}`).join(" ")}`);
    out.push(`  Captured per seat: ${PLAYER_IDS.map((p) => `P${p}=${r.roundPoints?.[p] ?? 0}`).join(" ")}`);
    out.push(`  Caller-team total: ${teamPts}, Bid: ${r.winningBid} -> ${made ? "MADE" : "FAILED"}`);
    return out.join("\n");
  });
}

const argv = process.argv;
const count = parseInt(argv[2] ?? "3", 10);
const baseSeed = parseInt(argv[3] ?? "4242", 10);
const pool = (argv[4] ?? "hard,hard-2,hard-3,hard-4")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean) as AIPersonality[];
const outDir = argv[5] ?? "docs/game_traces";
mkdirSync(outDir, { recursive: true });

const index: string[] = [`# Mixed hard-AI trace batch`, "", `baseSeed=${baseSeed}`, `pool=${pool.join(",")}`, ""];
for (let i = 0; i < count; i++) {
  const seed = baseSeed + i * 7919;
  const seats = randomSeats(seed ^ 0x9E3779B9, pool);
  const trace = playOneTrace(seats, seed);
  const path = `${outDir}/mixed_hard_${seed}.txt`;
  writeFileSync(path, trace, "utf8");
  index.push(`- mixed_hard_${seed}.txt: ${seats.map((p, seat) => `P${seat}:${p}`).join(" ")}`);
  console.log(`wrote ${path}`);
}
writeFileSync(`${outDir}/README.md`, index.join("\n"), "utf8");
