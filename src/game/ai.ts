import { legalPlays, trickWinner } from "./rules";
import {
  Card, GameState, MIN_BID, PlayerId, RoundState, Suit, SUITS, Trick, cardPoints,
  Rank, BID_INCREMENT, AIPersonality,
} from "./types";

// =============================================================================
// PUBLIC DISPATCH — chooses behavior based on player's AIPersonality
// =============================================================================

export function aiBidDecision(state: GameState, player: PlayerId): { bid: number | "pass" } {
  const personality = state.players[player].aiPersonality ?? "normal";
  if (personality === "random") return randomBid(state);
  return normalBid(state, player);
}

export function aiDeclareDecision(state: GameState, player: PlayerId): { trump: Suit; partnerCard: Card } {
  const personality = state.players[player].aiPersonality ?? "normal";
  if (personality === "random") return randomDeclare(state, player);
  return normalDeclare(state, player);
}

export function aiPlayDecision(state: GameState, player: PlayerId): Card {
  const personality = state.players[player].aiPersonality ?? "normal";
  if (personality === "random") return randomPlay(state, player);
  return greedyPlay(state, player);
}

// =============================================================================
// HAND STRENGTH — used by Normal personality's bid + declare
// =============================================================================

export function evaluateHand(hand: Card[]): {
  bestTrump: Suit;
  estimatePoints: number;
  trumpStrengthBySuit: Record<Suit, number>;
} {
  const trumpStrengthBySuit: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  const myPoints = hand.reduce((s, c) => s + cardPoints(c), 0);
  for (const s of SUITS) {
    const cardsInSuit = hand.filter((c) => c.suit === s);
    const otherTopCards = hand.filter((c) => c.suit !== s && c.rank >= 13).length;
    const topRanks = cardsInSuit.filter((c) => c.rank >= 12).length;
    const aceCount = cardsInSuit.filter((c) => c.rank === 14).length;
    const kingCount = cardsInSuit.filter((c) => c.rank === 13).length;
    const topControlBonus = (aceCount >= 2 && kingCount >= 2 ? 25 : 0) + aceCount * 6 + kingCount * 3;
    const pointPotential = hand.reduce((sum, c) => {
      const inTrump = c.suit === s;
      const cp = cardPoints(c);
      if (inTrump) return sum + cp + (c.rank >= 13 ? 10 : 0);
      if (c.rank >= 13) return sum + cp / 2 + 4;
      return sum;
    }, 0);
    const length = cardsInSuit.length;
    const voidsBonus = SUITS.filter((s2) => s2 !== s && hand.every((c) => c.suit !== s2)).length * 12;
    const nearVoidsBonus = SUITS.filter((s2) => s2 !== s && hand.filter((c) => c.suit === s2).length === 1).length * 4;
    trumpStrengthBySuit[s] =
      length * 4 + topRanks * 8 + otherTopCards * 5 + pointPotential + voidsBonus + nearVoidsBonus + topControlBonus;
  }
  let bestTrump: Suit = "S";
  let best = -Infinity;
  for (const s of SUITS) {
    if (trumpStrengthBySuit[s] > best) {
      best = trumpStrengthBySuit[s];
      bestTrump = s;
    }
  }
  const estimatePoints = Math.round(Math.max(120, Math.min(280, 100 + best * 1.05 + myPoints * 0.3)));
  return { bestTrump, estimatePoints, trumpStrengthBySuit };
}

// =============================================================================
// TEAM KNOWLEDGE — what does this AI know about who is on whose team?
// =============================================================================

/** Returns the set of players known (to this AI) to be on the caller's team, or null if unknown. */
function knownCallerTeam(state: GameState, player: PlayerId): Set<PlayerId> | null {
  const r = state.round;
  if (r.bidder === undefined || !r.partnerCard) return null;

  const hand = r.hands[player];
  const iAmBidder = player === r.bidder;
  const iAmPartner = hand.some(
    (c) => c.suit === r.partnerCard!.suit && c.rank === r.partnerCard!.rank,
  );

  if (iAmBidder) {
    // The caller knows themselves + every partner who has revealed so far.
    return new Set<PlayerId>([r.bidder, ...r.revealedPartners]);
  }
  if (iAmPartner) {
    // A partner knows the caller, themselves, and any other partner who has revealed.
    return new Set<PlayerId>([r.bidder, player, ...r.revealedPartners]);
  }
  // Opponent: only knows the team once every partner has revealed.
  const totalPartners = r.partners?.length ?? 0;
  if (totalPartners > 0 && r.revealedPartners.length >= totalPartners) {
    return new Set<PlayerId>([r.bidder, ...r.revealedPartners]);
  }
  return null;
}

// =============================================================================
// RANDOM personality
// =============================================================================

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBid(state: GameState): { bid: number | "pass" } {
  if (Math.random() < 0.5) return { bid: "pass" };
  const r = state.round;
  const currentHigh = Math.max(0, ...r.bids.map((b) => b.amount));
  const min = currentHigh === 0 ? MIN_BID : currentHigh + BID_INCREMENT;
  if (min > 300) return { bid: "pass" };
  return { bid: min };
}

function randomDeclare(state: GameState, player: PlayerId): { trump: Suit; partnerCard: Card } {
  const trump = randomChoice(SUITS);
  const hand = state.round.hands[player];
  const countOf = (s: Suit, r: Rank) => hand.filter((c) => c.suit === s && c.rank === r).length;
  const totalCopies = (s: Suit, r: Rank) => (s === "S" && r === 7 ? 1 : 2);
  const candidates: Card[] = [];
  const allRanks: Rank[] = [14, 13, 12, 11, 10, 9, 8, 7, 5];
  for (const s of SUITS) {
    for (const rank of allRanks) {
      if (rank === 7 && s !== "S") continue;
      if (countOf(s, rank) >= totalCopies(s, rank)) continue;
      candidates.push({ suit: s, rank, id: `${s}${rank}_0` });
    }
  }
  return { trump, partnerCard: randomChoice(candidates) };
}

function randomPlay(state: GameState, player: PlayerId): Card {
  const legal = legalPlays(state.round.hands[player], state.round.currentTrick);
  return randomChoice(legal);
}

// =============================================================================
// NORMAL personality — greedy with smear-to-known-ally
// =============================================================================

function normalBid(state: GameState, player: PlayerId): { bid: number | "pass" } {
  const hand = state.round.hands[player];
  const { estimatePoints } = evaluateHand(hand);
  const currentHigh = Math.max(0, ...state.round.bids.map((b) => b.amount));
  const required = currentHigh === 0 ? MIN_BID : currentHigh + BID_INCREMENT;
  const aceCount = hand.filter((c) => c.rank === 14).length;
  const hasBlackQueen = hand.some((c) => c.suit === "S" && c.rank === 12);
  const obviousPartnerHand = aceCount >= 3 || (aceCount >= 2 && hasBlackQueen);
  const ceiling = obviousPartnerHand ? 0.55 : 0.78;
  const willingnessCeiling = Math.round(estimatePoints * ceiling);
  if (required > willingnessCeiling) return { bid: "pass" };
  if (Math.random() < 0.08 && currentHigh > 0) return { bid: "pass" };
  return { bid: required };
}

function normalDeclare(state: GameState, player: PlayerId): { trump: Suit; partnerCard: Card } {
  const hand = state.round.hands[player];
  const { bestTrump } = evaluateHand(hand);
  const lengthOf = (s: Suit) => hand.filter((c) => c.suit === s).length;
  const hasRank = (s: Suit, r: Rank) => hand.some((c) => c.suit === s && c.rank === r);
  const countOf = (s: Suit, r: Rank) => hand.filter((c) => c.suit === s && c.rank === r).length;
  const totalCopies = (s: Suit, r: Rank) => (s === "S" && r === 7 ? 1 : 2);
  const sideSuits = SUITS.filter((s) => s !== bestTrump);
  const longestSide = sideSuits.slice().sort((a, b) => lengthOf(b) - lengthOf(a))[0];

  const candidates: { card: Card; score: number }[] = [];
  for (const s of SUITS) {
    for (const rank of [14, 13, 12, 11, 10] as Rank[]) {
      if (countOf(s, rank) >= totalCopies(s, rank)) continue;
      let score = 0;
      if (rank === 14) score += 12;
      else if (rank === 13) score += hasRank(s, 14) ? 9 : 4;
      else if (rank === 12) score += hasRank(s, 14) && hasRank(s, 13) ? 7 : 2;
      else score += 1;
      score += lengthOf(s);
      if (s === longestSide && rank === 14) score += 10;
      if (s === "S" && rank === 12 && countOf("S", 12) === 0) score += 8;
      if (s === bestTrump && rank === 14 && !hasRank(bestTrump, 14)) score += 6;
      if (countOf(s, rank) === 0) score += 3;
      score += Math.random() * 1.5;
      candidates.push({ card: { suit: s, rank, id: `${s}${rank}_0` }, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return { trump: bestTrump, partnerCard: candidates[0].card };
}

/**
 * Greedy normal play:
 *   1. If a known ally is currently winning the trick, feed them the highest-point card we can.
 *   2. Otherwise, play the strongest legal card — highest trump if any are legal, else highest rank.
 *
 * "Known ally" is determined by `knownCallerTeam`:
 *   - The caller knows themselves + revealed partners.
 *   - Partners (holders of the called card) know caller + self + other revealed partners.
 *   - Opponents only get knowledge once every partner has revealed.
 */
function greedyPlay(state: GameState, player: PlayerId): Card {
  const r: RoundState = state.round;
  const trick = r.currentTrick!;
  const hand = r.hands[player];
  const legal = legalPlays(hand, trick);
  const trump = r.trump;

  const team = knownCallerTeam(state, player);
  const iAmOnCallerTeam = team !== null && team.has(player);

  // Identify the player currently winning this trick (if any).
  const currentWinner = trick.plays.length > 0 ? trickWinner(trick, trump) : undefined;
  let winnerIsAlly = false;
  if (currentWinner !== undefined && team !== null) {
    if (iAmOnCallerTeam) {
      winnerIsAlly = team.has(currentWinner);
    } else {
      // Opponent — an ally is anyone NOT on the caller team.
      winnerIsAlly = !team.has(currentWinner);
    }
  }

  if (winnerIsAlly) {
    // Feed the trick: highest-point card available.
    const pointCards = legal.filter((c) => cardPoints(c) > 0)
      .sort((a, b) => cardPoints(b) - cardPoints(a) || a.rank - b.rank);
    if (pointCards.length > 0) return pointCards[0];
    // No points to feed — dump lowest non-trump (don't waste trump on a teammate's trick).
    const nonTrumpLow = legal.filter((c) => c.suit !== trump).sort((a, b) => a.rank - b.rank);
    if (nonTrumpLow.length > 0) return nonTrumpLow[0];
    return [...legal].sort((a, b) => a.rank - b.rank)[0];
  }

  // Greedy: highest-ranked card that's legal, preferring trump.
  const trumps = legal.filter((c) => c.suit === trump);
  if (trumps.length > 0) {
    return trumps.sort((a, b) => b.rank - a.rank)[0];
  }
  return [...legal].sort((a, b) => b.rank - a.rank)[0];
}
