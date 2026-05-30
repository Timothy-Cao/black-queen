// =============================================================================
//  HARD AI — strategic 5-player Black Queen, with tunable weights.
//
//  Every magic number lives in HardWeights. DEFAULT_HARD_WEIGHTS is the
//  hand-crafted baseline. Two personalities consume this module:
//      "hard"        — fixed DEFAULT_HARD_WEIGHTS, untouched by tuning
//      "hard-2"  — reads activeHardWeights, set by the evolutionary tuner
// =============================================================================

import { legalPlays, trickWinner } from "./rules";
import {
  Card, GameState, MIN_BID, BID_INCREMENT, PlayerId, Rank, Suit, SUITS,
  Trick, cardPoints,
} from "./types";

// -----------------------------------------------------------------------------
//  Weights
// -----------------------------------------------------------------------------

export interface HardWeights {
  // Trump scoring
  trumpLengthFactor: number;
  trumpTopFactor: number;
  trumpMidFactor: number;
  trumpLowFactor: number;
  trumpDoubleAceBonus: number;
  trumpDoubleKingBonus: number;
  trumpVoidFull: number;
  trumpVoidShort: number;
  trumpVoidShortish: number;
  trumpProtectedTrumpFactor: number;
  trumpProtectedSideFactor: number;
  trumpUnprotectedSidePenalty: number;
  trumpQSpadesBonus: number;

  // Partner-card scoring (raw rank/suit weights)
  partnerAceScore: number;
  partnerKingScore: number;
  partnerQSpadesScore: number;
  partnerQueenScore: number;
  partnerJackScore: number;
  partnerTenScore: number;
  partnerLowPenalty: number;
  partnerTrumpBonus: number;
  partnerPointHalfWeight: number;

  // Bid capacity
  bidSelfCaptureFromPoints: number;
  bidSelfCaptureFromTrump: number;
  bidSelfCaptureFromTrumpScore: number;
  bidSelfCaptureMaxFromScore: number;
  bidTrumpControlTopFactor: number;
  bidTrumpControlLongFactor: number;
  bidVoidBonusFull: number;
  bidVoidBonusShort: number;
  bidPartnerBonusBase: number;
  bidPartnerBonusFewAces: number;
  bidPartnerBonusNoQSpades: number;
  bidProtectionPerCard: number;
  bidRiskNoLong: number;
  bidRiskNoTopTrump: number;
  bidRiskBalanced: number;
  bidCap: number;
  bidCapExtraordinary: number;
  // Minimum bid target the AI is willing to chase regardless of own-hand strength,
  // reflecting that a hidden partner carries ~half the deck. Empirically even a
  // points-poor hand makes 150 ~86% of the time and 170 ~77% (defenders score 0,
  // so passing a weak hand is ~0 EV while opening 150 is ~+119 EV). 0 = disabled
  // (the locked `hard` baseline keeps the old own-hand-only behavior).
  bidPartnerCarryFloor: number;

  // Move scoring / spend cost
  trumpSpendCostFactor: number;
  trumpSpendCostHigh: number;
  trumpSpendCostAce: number;
  spendAceCost: number;
  spendKingCost: number;
  spendQueenCost: number;

  // Q♠ handling
  qSpadesCommitBonus: number;
  qSpadesDumpPenalty: number;
  qSpadesCommitThreshold: number;

  // Move scoring multipliers
  smearBonusMul: number;
  enemyFeedPenaltyMul: number;
  cheapestWinnerPenaltyFactor: number;

  // Void creation (offensive shedding while discarding)
  voidCreateSingletonBonus: number;  // played card was the LAST of its (non-trump) suit
  voidCreateDoubletonBonus: number;  // bringing suit count from 2 → 1
  voidCreateTrumpGate: number;       // multiplier when we still hold ≥1 mid+ trump

  // Alliance inference from observed play
  inferSmearStrength: number;        // how much each point-feed update shifts the prior
  inferSmearThreshold: number;       // minimum cardPoints to count as a "smear" signal
  inferAllyThreshold: number;        // posterior probability needed to UPGRADE to inferred ally
  inferPropagationIters: number;     // iterations of indirect-evidence propagation (smear-to-likely-ally)
  inferPropagationDecay: number;     // strength multiplier per propagation iter (lower = more conservative)
}

export const DEFAULT_HARD_WEIGHTS: HardWeights = {
  trumpLengthFactor: 12,
  trumpTopFactor: 20,
  trumpMidFactor: 10,
  trumpLowFactor: 5,
  trumpDoubleAceBonus: 25,
  trumpDoubleKingBonus: 15,
  trumpVoidFull: 30,
  trumpVoidShort: 15,
  trumpVoidShortish: 5,
  trumpProtectedTrumpFactor: 0.8,
  trumpProtectedSideFactor: 0.4,
  trumpUnprotectedSidePenalty: 0.4,
  trumpQSpadesBonus: 15,

  partnerAceScore: 40,
  partnerKingScore: 25,
  partnerQSpadesScore: 45,
  partnerQueenScore: 15,
  partnerJackScore: 8,
  partnerTenScore: 6,
  partnerLowPenalty: 25,
  partnerTrumpBonus: 20,
  partnerPointHalfWeight: 0.5,

  bidSelfCaptureFromPoints: 0.55,
  bidSelfCaptureFromTrump: 0.15,
  bidSelfCaptureFromTrumpScore: 0.18,
  bidSelfCaptureMaxFromScore: 60,
  bidTrumpControlTopFactor: 8,
  bidTrumpControlLongFactor: 6,
  bidVoidBonusFull: 18,
  bidVoidBonusShort: 6,
  bidPartnerBonusBase: 25,
  bidPartnerBonusFewAces: 15,
  bidPartnerBonusNoQSpades: 12,
  bidProtectionPerCard: 4,
  bidRiskNoLong: 25,
  bidRiskNoTopTrump: 15,
  bidRiskBalanced: 10,
  bidCap: 240,
  bidCapExtraordinary: 280,
  bidPartnerCarryFloor: 0,

  trumpSpendCostFactor: 0.6,
  trumpSpendCostHigh: 6,
  trumpSpendCostAce: 4,
  spendAceCost: 5,
  spendKingCost: 2.5,
  spendQueenCost: 1.5,

  qSpadesCommitBonus: 12,
  qSpadesDumpPenalty: 35,
  qSpadesCommitThreshold: 0.55,

  smearBonusMul: 1.4,
  enemyFeedPenaltyMul: 1.5,
  cheapestWinnerPenaltyFactor: 1.5,

  voidCreateSingletonBonus: 15,
  voidCreateDoubletonBonus: 5,
  voidCreateTrumpGate: 1.5,

  inferSmearStrength: 0.35,
  inferSmearThreshold: 10,
  inferAllyThreshold: 0.85,
  // Propagation: tried 2 iters at decay 0.5 → A/B showed +0.06pp, essentially noise.
  // Code is kept for future exploration but defaults to 0 (off).
  inferPropagationIters: 0,
  inferPropagationDecay: 0.5,
};

// activeHardWeights: weights for the LATEST tuned generation (Hard-3 today).
let activeHardWeights: HardWeights = DEFAULT_HARD_WEIGHTS;
export function setActiveHardWeights(w: HardWeights): void { activeHardWeights = w; }
export function getActiveHardWeights(): HardWeights { return activeHardWeights; }
export function resetActiveHardWeights(): void { activeHardWeights = DEFAULT_HARD_WEIGHTS; }

// gen2Weights: weights for the previous tuned generation (Hard-2). Loaded by the
// app at startup from tuned_weights_v1.json so Hard-2 stays selectable for comparison.
let gen2HardWeights: HardWeights = DEFAULT_HARD_WEIGHTS;
export function setGen2HardWeights(w: HardWeights): void { gen2HardWeights = w; }
export function getGen2HardWeights(): HardWeights { return gen2HardWeights; }

// -----------------------------------------------------------------------------
//  Card / state helpers
// -----------------------------------------------------------------------------

const TOTAL_COPIES = (s: Suit, r: Rank) => (s === "S" && r === 7 ? 1 : 2);
const RANK_PRESENT_IN_DECK: Rank[] = [5, 7, 8, 9, 10, 11, 12, 13, 14];
function rankIsInDeck(s: Suit, r: Rank): boolean {
  if (r === 7 && s !== "S") return false;
  if (![5, 7, 8, 9, 10, 11, 12, 13, 14].includes(r)) return false;
  return true;
}

interface PlayedView {
  enemyCopiesRemaining: (s: Suit, r: Rank) => number;
  knownVoid: (p: PlayerId, s: Suit) => boolean;
  highestRemainingInSuit: (s: Suit, includeMine?: boolean) => number;
  highestEnemyTrump: (trump: Suit | undefined) => number;
}

function buildPlayedView(state: GameState, me: PlayerId): PlayedView {
  const r = state.round;
  const played = new Map<string, number>();
  const myHand = r.hands[me];
  const myCopies = new Map<string, number>();
  for (const c of myHand) {
    const k = `${c.suit}${c.rank}`;
    myCopies.set(k, (myCopies.get(k) ?? 0) + 1);
  }
  for (const t of r.tricks) for (const p of t.plays) {
    const k = `${p.card.suit}${p.card.rank}`;
    played.set(k, (played.get(k) ?? 0) + 1);
  }
  if (r.currentTrick) for (const p of r.currentTrick.plays) {
    const k = `${p.card.suit}${p.card.rank}`;
    played.set(k, (played.get(k) ?? 0) + 1);
  }
  const enemyCopiesRemaining = (s: Suit, rr: Rank): number => {
    const total = TOTAL_COPIES(s, rr);
    const p = played.get(`${s}${rr}`) ?? 0;
    const mine = myCopies.get(`${s}${rr}`) ?? 0;
    return Math.max(0, total - p - mine);
  };
  const voids: Record<PlayerId, Set<Suit>> = { 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() };
  const considerTrick = (t: Trick) => {
    if (t.plays.length === 0) return;
    const led = t.plays[0].card.suit;
    for (const p of t.plays.slice(1)) if (p.card.suit !== led) voids[p.player].add(led);
  };
  for (const t of r.tricks) considerTrick(t);
  if (r.currentTrick) considerTrick(r.currentTrick);
  const knownVoid = (p: PlayerId, s: Suit) => voids[p].has(s);
  const highestRemainingInSuit = (s: Suit, includeMine = true): number => {
    let best = 0;
    for (const rank of RANK_PRESENT_IN_DECK) {
      if (!rankIsInDeck(s, rank)) continue;
      const total = TOTAL_COPIES(s, rank);
      const playedN = played.get(`${s}${rank}`) ?? 0;
      const mine = myCopies.get(`${s}${rank}`) ?? 0;
      const remaining = total - playedN - (includeMine ? 0 : mine);
      if (remaining > 0 && rank > best) best = rank;
    }
    return best;
  };
  const highestEnemyTrump = (trump: Suit | undefined): number => {
    if (!trump) return 0;
    let best = 0;
    for (const rank of RANK_PRESENT_IN_DECK) {
      if (!rankIsInDeck(trump, rank)) continue;
      if (enemyCopiesRemaining(trump, rank) > 0 && rank > best) best = rank;
    }
    return best;
  };
  return { enemyCopiesRemaining, knownVoid, highestRemainingInSuit, highestEnemyTrump };
}

// -----------------------------------------------------------------------------
//  Team knowledge
// -----------------------------------------------------------------------------

interface TeamKnowledge {
  iAmCaller: boolean;
  iAmPartner: boolean;
  onCallerTeam: boolean;
  confirmedCallerTeam: Set<PlayerId>;
  fullyResolved: boolean;
  confirmedEnemies: Set<PlayerId>;
  /** P(player ∈ caller team) for each seat. 1 = confirmed ally, 0 = confirmed enemy, in-between = inferred. */
  alliancePrior: Record<PlayerId, number>;
}

/**
 * Infer per-player probability of being on the caller team by walking trick
 * history. Strongest signal: a player voluntarily fed points to a trick that
 * a KNOWN-affiliation player won. Updates are clamped to [0.02, 0.98].
 */
function inferAlliancePriors(
  state: GameState, me: PlayerId, confirmed: Set<PlayerId>, confirmedEnemies: Set<PlayerId>, w: HardWeights,
): Record<PlayerId, number> {
  const r = state.round;
  const out: Record<PlayerId, number> = { 0: 0.5, 1: 0.5, 2: 0.5, 3: 0.5, 4: 0.5 };
  const callerId = r.bidder;
  if (callerId === undefined) return out;
  // Base prior: among unknown players, P(in caller team) = partnersLeft / unknownsCount.
  const totalPartners = r.partners?.length ?? 0;
  const unknowns: PlayerId[] = ([0, 1, 2, 3, 4] as PlayerId[]).filter(
    (p) => !confirmed.has(p) && !confirmedEnemies.has(p),
  );
  const partnersLeft = Math.max(0, totalPartners - r.revealedPartners.length);
  const basePrior = unknowns.length > 0 ? partnersLeft / unknowns.length : 0;
  for (const p of [0, 1, 2, 3, 4] as PlayerId[]) {
    if (confirmed.has(p)) out[p] = 1;
    else if (confirmedEnemies.has(p)) out[p] = 0;
    else out[p] = basePrior;
  }
  // Pre-compute the smear events once: for each play that fed points to a
  // non-self winner, we'll repeatedly score it against the latest priors.
  type Smear = { player: PlayerId; winner: PlayerId; pts: number };
  const smears: Smear[] = [];
  const allTricks: Trick[] = [...r.tricks, ...(r.currentTrick ? [r.currentTrick] : [])];
  for (const t of allTricks) {
    if (t.plays.length === 0) continue;
    for (let i = 1; i < t.plays.length; i++) {
      const play = t.plays[i];
      const player = play.player;
      if (confirmed.has(player) || confirmedEnemies.has(player)) continue;
      const pts = cardPoints(play.card);
      if (pts < w.inferSmearThreshold) continue;
      const partial: Trick = { ...t, plays: t.plays.slice(0, i + 1) };
      const winnerSoFar = trickWinner(partial, r.trump);
      if (winnerSoFar === player) continue;
      smears.push({ player, winner: winnerSoFar, pts });
    }
  }

  // Pass 0: only consider smears whose winner has a CONFIRMED affiliation.
  // Pass N≥1: consider smears whose winner has any non-neutral prior,
  // scaled by (prior − 0.5) ×2 (signed bias) and decayed per iter.
  // This bootstraps multi-hop reasoning: P1 smears to caller → P1 likely ally;
  // then P2 smears to P1 → P2 likely ally.
  const propIters = Math.max(0, Math.floor(w.inferPropagationIters));
  for (let iter = 0; iter <= propIters; iter++) {
    const baseStart = { ...out };
    for (const s of smears) {
      let dir = 0;
      if (iter === 0) {
        if (confirmed.has(s.winner)) dir = +1;
        else if (confirmedEnemies.has(s.winner)) dir = -1;
      } else {
        const winnerBias = (baseStart[s.winner] - 0.5) * 2;  // -1..+1
        if (Math.abs(winnerBias) < 0.1) continue;            // too weak to bother
        dir = winnerBias;
      }
      if (dir === 0) continue;
      const decay = iter === 0 ? 1 : Math.pow(w.inferPropagationDecay, iter);
      const delta = dir * w.inferSmearStrength * (s.pts / 30) * decay;
      out[s.player] = Math.max(0.02, Math.min(0.98, out[s.player] + delta));
    }
  }
  // Re-normalize unknowns so they sum to partnersLeft (preserve count invariant).
  if (unknowns.length > 0 && partnersLeft > 0) {
    const sum = unknowns.reduce<number>((s, p) => s + out[p], 0);
    if (sum > 0) {
      const scale = partnersLeft / sum;
      for (const p of unknowns) out[p] = Math.max(0.02, Math.min(0.98, out[p] * scale));
    }
  }
  // Re-confirm pinned values (renorm may have nudged them; restore).
  for (const p of [0, 1, 2, 3, 4] as PlayerId[]) {
    if (confirmed.has(p)) out[p] = 1;
    else if (confirmedEnemies.has(p)) out[p] = 0;
  }
  return out;
}

function computeTeam(state: GameState, me: PlayerId, w: HardWeights): TeamKnowledge {
  const r = state.round;
  const callerId = r.bidder;
  const confirmed = new Set<PlayerId>();
  if (callerId !== undefined) confirmed.add(callerId);
  for (const id of r.revealedPartners) confirmed.add(id);
  let iAmCaller = false;
  let iAmPartner = false;
  if (callerId !== undefined) {
    iAmCaller = callerId === me;
    if (r.partnerCard) {
      iAmPartner = r.hands[me].some(
        (c) => c.suit === r.partnerCard!.suit && c.rank === r.partnerCard!.rank,
      );
      if (iAmPartner) confirmed.add(me);
    }
  }
  const onCallerTeam = iAmCaller || iAmPartner;
  const totalPartners = r.partners?.length ?? 0;
  const fullyResolved = totalPartners > 0 && r.revealedPartners.length >= totalPartners;
  const confirmedEnemies = new Set<PlayerId>();
  if (fullyResolved) {
    for (const p of [0, 1, 2, 3, 4] as PlayerId[]) if (!confirmed.has(p)) confirmedEnemies.add(p);
  }
  const alliancePrior = inferAlliancePriors(state, me, confirmed, confirmedEnemies, w);
  return { iAmCaller, iAmPartner, onCallerTeam, confirmedCallerTeam: confirmed, fullyResolved, confirmedEnemies, alliancePrior };
}

// -----------------------------------------------------------------------------
//  Hand evaluation
// -----------------------------------------------------------------------------

function lengthIn(hand: Card[], s: Suit): number { return hand.filter((c) => c.suit === s).length; }
function countOf(hand: Card[], s: Suit, r: Rank): number { return hand.filter((c) => c.suit === s && c.rank === r).length; }
function handPoints(hand: Card[]): number { return hand.reduce((sum, c) => sum + cardPoints(c), 0); }

function evaluateTrumpSuit(hand: Card[], suit: Suit, w: HardWeights): number {
  let score = 0;
  const inSuit = hand.filter((c) => c.suit === suit);
  score += w.trumpLengthFactor * inSuit.length;
  const topTrumps = inSuit.filter((c) => c.rank >= 12).length;
  const midTrumps = inSuit.filter((c) => c.rank >= 9 && c.rank <= 11).length;
  const lowTrumps = inSuit.filter((c) => c.rank <= 8).length;
  score += w.trumpTopFactor * topTrumps;
  score += w.trumpMidFactor * midTrumps;
  score += w.trumpLowFactor * lowTrumps;
  const aceCount = inSuit.filter((c) => c.rank === 14).length;
  const kingCount = inSuit.filter((c) => c.rank === 13).length;
  if (aceCount >= 2) score += w.trumpDoubleAceBonus;
  if (kingCount >= 2 && aceCount >= 1) score += w.trumpDoubleKingBonus;
  for (const s2 of SUITS) {
    if (s2 === suit) continue;
    const n = lengthIn(hand, s2);
    if (n === 0) score += w.trumpVoidFull;
    else if (n === 1) score += w.trumpVoidShort;
    else if (n === 2) score += w.trumpVoidShortish;
  }
  for (const c of hand) {
    if (cardPoints(c) === 0) continue;
    if (c.suit === suit) {
      score += cardPoints(c) * w.trumpProtectedTrumpFactor;
    } else {
      const sideLen = lengthIn(hand, c.suit);
      const sideTop = hand.filter((x) => x.suit === c.suit && x.rank >= 13).length;
      if (sideTop > 0 && sideLen >= 3) score += cardPoints(c) * w.trumpProtectedSideFactor;
      else score -= cardPoints(c) * w.trumpUnprotectedSidePenalty;
    }
  }
  if (suit === "S") {
    const qSpades = inSuit.filter((c) => c.rank === 12).length;
    score += w.trumpQSpadesBonus * qSpades;
  }
  return score;
}

function chooseBestTrump(hand: Card[], w: HardWeights): { suit: Suit; score: number } {
  let best: Suit = "S";
  let bestScore = -Infinity;
  for (const s of SUITS) {
    const sc = evaluateTrumpSuit(hand, s, w);
    if (sc > bestScore) { bestScore = sc; best = s; }
  }
  return { suit: best, score: bestScore };
}

function chooseBestPartnerCard(hand: Card[], trump: Suit, w: HardWeights): Card {
  const candidates: { card: Card; score: number }[] = [];
  for (const s of SUITS) {
    for (const rank of [14, 13, 12, 11, 10, 9, 8, 7, 5] as Rank[]) {
      if (!rankIsInDeck(s, rank)) continue;
      if (countOf(hand, s, rank) > 0) continue;
      let score = 0;
      if (rank === 14) score += w.partnerAceScore;
      else if (rank === 13) score += w.partnerKingScore;
      else if (rank === 12 && s === "S") score += w.partnerQSpadesScore;
      else if (rank === 12) score += w.partnerQueenScore;
      else if (rank === 11) score += w.partnerJackScore;
      else if (rank === 10) score += w.partnerTenScore;
      else if (rank === 5 || rank === 8 || rank === 9) score -= w.partnerLowPenalty;
      else score -= 10;
      if (s === trump) score += w.partnerTrumpBonus;
      const cp = cardPoints({ suit: s, rank, id: "" });
      if (cp > 0) score += cp * w.partnerPointHalfWeight;
      candidates.push({ card: { suit: s, rank, id: `${s}${rank}_0` }, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.card ?? { suit: trump, rank: 14, id: `${trump}14_0` };
}

function estimateBidCapacity(hand: Card[], w: HardWeights): number {
  const { suit: trump, score: trumpScore } = chooseBestTrump(hand, w);
  const myPoints = handPoints(hand);
  let selfCapture = myPoints * w.bidSelfCaptureFromPoints;
  selfCapture += handPoints(hand.filter((c) => c.suit === trump)) * w.bidSelfCaptureFromTrump;
  selfCapture += Math.min(w.bidSelfCaptureMaxFromScore, trumpScore * w.bidSelfCaptureFromTrumpScore);
  const topTrumps = hand.filter((c) => c.suit === trump && c.rank >= 12).length;
  const trumpLen = lengthIn(hand, trump);
  let trumpControl = 0;
  trumpControl += topTrumps * w.bidTrumpControlTopFactor;
  if (trumpLen >= 5) trumpControl += (trumpLen - 4) * w.bidTrumpControlLongFactor;
  let voidBonus = 0;
  for (const s of SUITS) {
    if (s === trump) continue;
    const n = lengthIn(hand, s);
    if (n === 0) voidBonus += w.bidVoidBonusFull;
    else if (n === 1) voidBonus += w.bidVoidBonusShort;
  }
  let partnerBonus = w.bidPartnerBonusBase;
  const acesHeld = hand.filter((c) => c.rank === 14).length;
  if (acesHeld <= 2) partnerBonus += w.bidPartnerBonusFewAces;
  const qSpadesHeld = hand.filter((c) => c.suit === "S" && c.rank === 12).length;
  if (qSpadesHeld === 0) partnerBonus += w.bidPartnerBonusNoQSpades;
  let protection = 0;
  for (const c of hand) {
    if (cardPoints(c) === 0 || c.suit === trump) continue;
    const sideTop = hand.filter((x) => x.suit === c.suit && x.rank >= 13).length;
    if (sideTop > 0) protection += w.bidProtectionPerCard;
  }
  let risk = 0;
  const lengths = SUITS.map((s) => lengthIn(hand, s)).sort((a, b) => b - a);
  if (lengths[0] <= 4) risk += w.bidRiskNoLong;
  if (topTrumps === 0) risk += w.bidRiskNoTopTrump;
  if (lengths[3] >= 2 && lengths[0] - lengths[3] <= 1) risk += w.bidRiskBalanced;
  const capacity = selfCapture + trumpControl + voidBonus + partnerBonus + protection - risk;
  return Math.round(capacity);
}

// -----------------------------------------------------------------------------
//  Public API — default + active variants
// -----------------------------------------------------------------------------

function hardBidImpl(state: GameState, player: PlayerId, w: HardWeights): { bid: number | "pass" } {
  const hand = state.round.hands[player];
  const capacity = estimateBidCapacity(hand, w);
  const currentHigh = Math.max(0, ...state.round.bids.map((b) => b.amount));
  const required = currentHigh === 0 ? MIN_BID : currentHigh + BID_INCREMENT;
  let target = Math.floor(capacity / 5) * 5;
  // Partner-carry floor: a hidden partner reliably contributes ~half the deck, so
  // the AI should chase at least `carryFloor` even on a weak hand instead of
  // conceding cheap auctions (defenders score 0). See _bid_floor.ts for the EV data.
  const carryFloor = carryFloorOverride() ?? w.bidPartnerCarryFloor;
  if (carryFloor > 0) target = Math.max(target, Math.floor(carryFloor / 5) * 5);
  if (target > w.bidCap && capacity < w.bidCapExtraordinary) target = Math.round(w.bidCap);
  if (target > 300) target = 300;
  if (required > target) return { bid: "pass" };
  if (Math.random() < 0.05 && required > MIN_BID) return { bid: "pass" };
  return { bid: required };
}

// A/B override for the partner-carry floor (CLI experiments only; browser uses the weight).
function carryFloorOverride(): number | null {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const v = proc?.env?.BQ_CARRY_FLOOR;
  return v === undefined ? null : Number(v);
}

function hardDeclareImpl(state: GameState, player: PlayerId, w: HardWeights): { trump: Suit; partnerCard: Card } {
  const hand = state.round.hands[player];
  const { suit: trump } = chooseBestTrump(hand, w);
  const partnerCard = chooseBestPartnerCard(hand, trump, w);
  return { trump, partnerCard };
}

// -----------------------------------------------------------------------------
//  Card play (move scoring)
// -----------------------------------------------------------------------------

interface PlayContext {
  state: GameState;
  player: PlayerId;
  hand: Card[];
  trick: Trick;
  legal: Card[];
  trump: Suit | undefined;
  team: TeamKnowledge;
  view: PlayedView;
  trickPointsSoFar: number;
  currentWinner?: PlayerId;
  iAmLastToPlay: boolean;
  tricksRemaining: number;
  w: HardWeights;
}

function buildContext(state: GameState, player: PlayerId, w: HardWeights): PlayContext {
  const r = state.round;
  const hand = r.hands[player];
  const trick = r.currentTrick ?? { leader: player, plays: [] };
  const legal = legalPlays(hand, trick);
  const team = computeTeam(state, player, w);
  const view = buildPlayedView(state, player);
  const trickPointsSoFar = trick.plays.reduce((s, p) => s + cardPoints(p.card), 0);
  const currentWinner = trick.plays.length > 0 ? trickWinner(trick, r.trump) : undefined;
  const iAmLastToPlay = trick.plays.length === 4;
  const tricksRemaining = 13 - r.tricks.length;
  return { state, player, hand, trick, legal, trump: r.trump, team, view, trickPointsSoFar, currentWinner, iAmLastToPlay, tricksRemaining, w };
}

function probabilityWinnerIsOurTeam(card: Card, ctx: PlayContext): number {
  const fake: Trick = { ...ctx.trick, plays: [...ctx.trick.plays, { player: ctx.player, card }] };
  const provisional = trickWinner(fake, ctx.trump);
  if (ctx.iAmLastToPlay) {
    if (provisional === ctx.player) return ctx.team.onCallerTeam ? 1 : 0;
    return playerLikelyOnMyTeam(provisional, ctx);
  }
  const stillToPlay = 4 - ctx.trick.plays.length - 1;
  if (provisional === ctx.player) {
    const led = ctx.trick.plays[0]?.card.suit ?? card.suit;
    const isTrump = ctx.trump !== undefined && card.suit === ctx.trump;
    const enemyHasHigherTrump = ctx.trump !== undefined && ctx.view.highestEnemyTrump(ctx.trump) > (isTrump ? card.rank : 0);
    const enemyHasHigherInSuit = !isTrump && ctx.view.highestRemainingInSuit(led, false) > card.rank;
    const beatable = enemyHasHigherTrump || enemyHasHigherInSuit;
    if (!beatable) return ctx.team.onCallerTeam ? 1 : 0;
    const overrideChance = Math.min(0.7, 0.15 * stillToPlay + (enemyHasHigherTrump ? 0.2 : 0));
    const myHoldChance = 1 - overrideChance;
    const otherTeamProb = averageTeamProbAmongRest(ctx);
    return ctx.team.onCallerTeam
      ? myHoldChance + overrideChance * otherTeamProb
      : (1 - myHoldChance) * (1 - otherTeamProb);
  }
  const sameSide = playerLikelyOnMyTeam(provisional, ctx);
  return sameSide * 0.85;
}

function playerLikelyOnMyTeam(p: PlayerId, ctx: PlayContext): number {
  const { team } = ctx;
  if (team.confirmedCallerTeam.has(p)) return team.onCallerTeam ? 1 : 0;
  if (team.confirmedEnemies.has(p)) return team.onCallerTeam ? 0 : 1;
  // Use the inferred per-player caller-team probability; flip if I'm an opponent.
  const callerTeamProb = team.alliancePrior[p];
  return team.onCallerTeam ? callerTeamProb : 1 - callerTeamProb;
}

function averageTeamProbAmongRest(ctx: PlayContext): number {
  const remaining = [0, 1, 2, 3, 4].filter((p) => p !== ctx.player && !ctx.trick.plays.some((pp) => pp.player === p));
  if (remaining.length === 0) return 0.5;
  return remaining.reduce((s, p) => s + playerLikelyOnMyTeam(p as PlayerId, ctx), 0) / remaining.length;
}

function wouldTakeTrickIfTopSoFar(card: Card, ctx: PlayContext): boolean {
  const fake: Trick = { ...ctx.trick, plays: [...ctx.trick.plays, { player: ctx.player, card }] };
  return trickWinner(fake, ctx.trump) === ctx.player;
}

function cardSpendCost(card: Card, ctx: PlayContext): number {
  const w = ctx.w;
  let cost = 0;
  if (ctx.trump && card.suit === ctx.trump) {
    cost += 2 + (card.rank - 4) * w.trumpSpendCostFactor;
    if (card.rank >= 13) cost += w.trumpSpendCostHigh;
    if (card.rank === 14) cost += w.trumpSpendCostAce;
  } else {
    if (card.rank === 14) cost += w.spendAceCost;
    else if (card.rank === 13) cost += w.spendKingCost;
    else if (card.rank === 12) cost += w.spendQueenCost;
  }
  return cost;
}

function averageRemainingPointAddition(ctx: PlayContext): number {
  const remainingPlayers = 4 - ctx.trick.plays.length - 1;
  if (remainingPlayers <= 0) return 0;
  const totalCards = 65 - (ctx.state.round.tricks.length * 5 + ctx.trick.plays.length + 1);
  if (totalCards <= 0) return 0;
  const pointsLeft = ctx.state.round.tricks.reduce(
    (acc, t) => acc - t.plays.reduce((s, p) => s + cardPoints(p.card), 0),
    300,
  ) - ctx.trickPointsSoFar;
  const avgPpc = pointsLeft / totalCards;
  return Math.max(0, avgPpc * remainingPlayers);
}

/**
 * Bonus for discards that shorten a side suit toward void.
 * Only applies when we're throwing away (not following, not trumping).
 * Gated by holding mid+ trump (otherwise the new void is worthless),
 * and scaled by tricks remaining (less time to exploit = less value).
 */
function voidCreationBonus(card: Card, ctx: PlayContext): number {
  const w = ctx.w;
  if (!ctx.trump) return 0;
  if (card.suit === ctx.trump) return 0;
  const led = ctx.trick.plays[0]?.card.suit;
  const isFollowing = led !== undefined && card.suit === led;
  if (isFollowing) return 0;
  const myCountInSuit = ctx.hand.filter((c) => c.suit === card.suit).length;
  let base = 0;
  if (myCountInSuit === 1) base = w.voidCreateSingletonBonus;
  else if (myCountInSuit === 2) base = w.voidCreateDoubletonBonus;
  if (base === 0) return 0;
  const myTrumpCount = ctx.hand.filter((c) => c.suit === ctx.trump).length;
  if (myTrumpCount === 0) return 0;
  const hasMidPlusTrump = ctx.hand.some((c) => c.suit === ctx.trump && c.rank >= 9);
  const mult = hasMidPlusTrump ? w.voidCreateTrumpGate : 1.0;
  const fractionLeft = ctx.tricksRemaining / 13;
  return base * mult * fractionLeft;
}

function scoreMove(card: Card, ctx: PlayContext): number {
  const w = ctx.w;
  const teamWinProb = probabilityWinnerIsOurTeam(card, ctx);
  const trickPotentialTotal = ctx.trickPointsSoFar + cardPoints(card)
    + (ctx.iAmLastToPlay ? 0 : averageRemainingPointAddition(ctx));
  let score = trickPotentialTotal * (2 * teamWinProb - 1);
  if (card.suit === "S" && card.rank === 12) {
    if (teamWinProb >= w.qSpadesCommitThreshold) score += w.qSpadesCommitBonus;
    else score -= w.qSpadesDumpPenalty;
  }
  score -= cardSpendCost(card, ctx);
  if (ctx.currentWinner !== undefined) {
    // Inferred ally/enemy if prior is strongly skewed past the threshold.
    const winnerCallerProb = ctx.team.alliancePrior[ctx.currentWinner];
    const inferredAlly = ctx.team.onCallerTeam ? winnerCallerProb >= w.inferAllyThreshold
                                                : winnerCallerProb <= 1 - w.inferAllyThreshold;
    const inferredEnemy = ctx.team.onCallerTeam ? winnerCallerProb <= 1 - w.inferAllyThreshold
                                                : winnerCallerProb >= w.inferAllyThreshold;
    const allyWinning = (ctx.team.confirmedCallerTeam.has(ctx.currentWinner) && ctx.team.onCallerTeam) || inferredAlly;
    const enemyWinning = ctx.team.confirmedEnemies.has(ctx.currentWinner)
      || (ctx.team.onCallerTeam && !ctx.team.confirmedCallerTeam.has(ctx.currentWinner) && ctx.team.fullyResolved)
      || inferredEnemy;
    if (allyWinning && cardPoints(card) > 0) {
      score += cardPoints(card) * w.smearBonusMul - cardSpendCost(card, ctx);
    }
    if (enemyWinning && cardPoints(card) > 0) {
      score -= cardPoints(card) * w.enemyFeedPenaltyMul;
    }
  }
  score += voidCreationBonus(card, ctx);
  if (wouldTakeTrickIfTopSoFar(card, ctx)) {
    const cheaper = ctx.legal.filter(
      (c) => c !== card && wouldTakeTrickIfTopSoFar(c, ctx) && c.rank < card.rank && c.suit === card.suit,
    );
    if (cheaper.length > 0) score -= (card.rank - cheaper[0].rank) * w.cheapestWinnerPenaltyFactor;
  }
  return score;
}

function chooseLead(ctx: PlayContext): Card {
  const { hand, legal, trump, team, view, state } = ctx;
  const r = state.round;
  if (team.onCallerTeam) {
    if (trump) {
      const trumps = legal.filter((c) => c.suit === trump);
      const highTrumps = trumps.filter((c) => c.rank >= 13);
      if (highTrumps.length > 0 && view.highestEnemyTrump(trump) > 0 && trumps.length >= 3) {
        return highest(highTrumps);
      }
      const sideAces = legal
        .filter((c) => c.suit !== trump && c.rank === 14)
        .sort((a, b) => lengthIn(hand, b.suit) - lengthIn(hand, a.suit));
      if (sideAces.length > 0) {
        const nonPartner = sideAces.find(
          (c) => !r.partnerCard || c.suit !== r.partnerCard.suit || c.rank !== r.partnerCard.rank,
        );
        if (nonPartner) return nonPartner;
        return sideAces[0];
      }
    }
    const safeHighs = legal
      .filter((c) => cardPoints(c) === 0 && c.rank >= 12)
      .sort((a, b) => b.rank - a.rank);
    if (safeHighs.length > 0) return safeHighs[0];
    return cheapestLoser(legal);
  }
  const callerId = r.bidder;
  if (callerId !== undefined && trump) {
    const voidSuits = SUITS.filter((s) => s !== trump && view.knownVoid(callerId, s));
    for (const s of voidSuits) {
      const inSuit = legal.filter((c) => c.suit === s).sort((a, b) => b.rank - a.rank);
      if (inSuit.length > 0) return inSuit[0];
    }
  }
  const sideAces = legal.filter((c) => c.suit !== trump && c.rank === 14);
  if (sideAces.length > 0) {
    const nonPartner = sideAces.find(
      (c) => !r.partnerCard || c.suit !== r.partnerCard.suit || c.rank !== r.partnerCard.rank,
    );
    if (nonPartner) return nonPartner;
  }
  const lows = legal
    .filter((c) => c.suit !== trump && cardPoints(c) === 0)
    .sort((a, b) => a.rank - b.rank);
  if (lows.length > 0) return lows[0];
  return cheapestLoser(legal);
}

function hardPlayImpl(state: GameState, player: PlayerId, w: HardWeights): Card {
  const ctx = buildContext(state, player, w);
  if (ctx.legal.length === 1) return ctx.legal[0];
  if (ctx.trick.plays.length === 0) return chooseLead(ctx);
  let best = ctx.legal[0];
  let bestScore = -Infinity;
  for (const c of ctx.legal) {
    const s = scoreMove(c, ctx);
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return best;
}

function highest(cards: Card[]): Card { return cards.slice().sort((a, b) => b.rank - a.rank)[0]; }
function cheapestLoser(cards: Card[]): Card {
  return cards.slice().sort((a, b) => cardPoints(a) - cardPoints(b) || a.rank - b.rank)[0];
}

// -----------------------------------------------------------------------------
//  Exposed entry points — locked-default and active-tuned variants
// -----------------------------------------------------------------------------

export function hardBid(state: GameState, player: PlayerId): { bid: number | "pass" } {
  return hardBidImpl(state, player, DEFAULT_HARD_WEIGHTS);
}
export function hardDeclare(state: GameState, player: PlayerId): { trump: Suit; partnerCard: Card } {
  return hardDeclareImpl(state, player, DEFAULT_HARD_WEIGHTS);
}
export function hardPlay(state: GameState, player: PlayerId): Card {
  return hardPlayImpl(state, player, DEFAULT_HARD_WEIGHTS);
}

// Experiment hook: bid with an explicit weight set (used by A/B harnesses to run
// floored vs unfloored seats in the same game). Not used by the dispatcher.
export function hardBidWith(state: GameState, player: PlayerId, w: HardWeights): { bid: number | "pass" } {
  return hardBidImpl(state, player, w);
}

// Hard-3 (latest tuned generation) — uses activeHardWeights.
export function hardTunedBid(state: GameState, player: PlayerId): { bid: number | "pass" } {
  return hardBidImpl(state, player, activeHardWeights);
}
export function hardTunedDeclare(state: GameState, player: PlayerId): { trump: Suit; partnerCard: Card } {
  return hardDeclareImpl(state, player, activeHardWeights);
}
export function hardTunedPlay(state: GameState, player: PlayerId): Card {
  return hardPlayImpl(state, player, activeHardWeights);
}

// Hard-2 (gen-2 frozen tuned generation) — uses gen2HardWeights.
export function hard2Bid(state: GameState, player: PlayerId): { bid: number | "pass" } {
  return hardBidImpl(state, player, gen2HardWeights);
}
export function hard2Declare(state: GameState, player: PlayerId): { trump: Suit; partnerCard: Card } {
  return hardDeclareImpl(state, player, gen2HardWeights);
}
export function hard2Play(state: GameState, player: PlayerId): Card {
  return hardPlayImpl(state, player, gen2HardWeights);
}
