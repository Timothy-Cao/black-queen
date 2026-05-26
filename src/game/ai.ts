import { legalPlays, trickWinner } from "./rules";
import {
  Card, GameState, MIN_BID, PlayerId, RoundState, Suit, SUITS, Trick, cardPoints,
  Rank, BID_INCREMENT,
} from "./types";

// ---------- Hand strength ----------

export function evaluateHand(hand: Card[]): {
  bestTrump: Suit;
  estimatePoints: number;
  trumpStrengthBySuit: Record<Suit, number>;
} {
  // For 13-card hand from a 65-card deck with 300 total points, an "average" hand holds ~60 pts.
  // A strong hand with partner support typically captures 140-220 pts.
  const trumpStrengthBySuit: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  const myPoints = hand.reduce((s, c) => s + cardPoints(c), 0);
  for (const s of SUITS) {
    const cardsInSuit = hand.filter((c) => c.suit === s);
    const otherTopCards = hand.filter((c) => c.suit !== s && c.rank >= 13).length;
    const topRanks = cardsInSuit.filter((c) => c.rank >= 12).length;
    // "Top control" bonus: both copies of A AND both K of THIS suit (with 2 decks).
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
    // Stronger void reward — voids let us cut as soon as that suit is led.
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

// ---------- Bidding ----------

export function aiBidDecision(state: GameState, player: PlayerId): { bid: number | "pass" } {
  const hand = state.round.hands[player];
  const { estimatePoints } = evaluateHand(hand);
  const currentHigh = Math.max(0, ...state.round.bids.map((b) => b.amount));
  const required = currentHigh === 0 ? MIN_BID : currentHigh + BID_INCREMENT;

  // Playbook tip #7: if hand is obviously full of "I'll be called" cards (multiple Aces + Q♠),
  // be more conservative — someone else will call us as partner anyway.
  const aceCount = hand.filter((c) => c.rank === 14).length;
  const hasBlackQueen = hand.some((c) => c.suit === "S" && c.rank === 12);
  const obviousPartnerHand = aceCount >= 3 || (aceCount >= 2 && hasBlackQueen);

  // Willingness ceiling: bid up to ceiling × estimate. Lower = more conservative.
  let ceiling = 0.78;
  if (obviousPartnerHand) ceiling = 0.55; // hold back
  const willingnessCeiling = Math.round(estimatePoints * ceiling);

  if (required > willingnessCeiling) return { bid: "pass" };
  // Occasionally pass to be unpredictable
  if (Math.random() < 0.08 && currentHigh > 0) return { bid: "pass" };
  return { bid: required };
}

// ---------- Declaring ----------

export function aiDeclareDecision(state: GameState, player: PlayerId): { trump: Suit; partnerCard: Card } {
  const hand = state.round.hands[player];
  const { bestTrump } = evaluateHand(hand);
  const lengthOf = (s: Suit) => hand.filter((c) => c.suit === s).length;
  const hasRank = (s: Suit, r: Rank) => hand.some((c) => c.suit === s && c.rank === r);
  const countOf = (s: Suit, r: Rank) => hand.filter((c) => c.suit === s && c.rank === r).length;
  const totalCopies = (s: Suit, r: Rank) => (s === "S" && r === 7 ? 1 : 2);

  // Find my LONGEST side suit (not trump) — playbook tip #10.
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

      // Bonus for length in that suit — partner can ride my trumps or lead it back.
      score += lengthOf(s);

      // Strong preference: Ace of my LONGEST side suit (playbook #10).
      if (s === longestSide && rank === 14) score += 10;

      // Q♠ is a special target (playbook #11): if I don't already hold it, calling it
      // hands partner a 30-pt swing opportunity.
      if (s === "S" && rank === 12 && countOf("S", 12) === 0) score += 8;

      // Trump Ace if I lack it — gives partner trump control.
      if (s === bestTrump && rank === 14 && !hasRank(bestTrump, 14)) score += 6;

      // Playbook #12: prefer cards I DON'T hold at all (more mysterious for opponents).
      if (countOf(s, rank) === 0) score += 3;

      score += Math.random() * 1.5;
      candidates.push({ card: { suit: s, rank, id: `${s}${rank}_0` }, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return { trump: bestTrump, partnerCard: candidates[0].card };
}

// ---------- Card play ----------

function wouldWinTrickIfTopSoFar(trick: Trick, candidate: Card, trump: Suit | undefined): boolean {
  if (trick.plays.length === 0) return true;
  const fake: Trick = { ...trick, plays: [...trick.plays, { player: 99 as any, card: candidate }] };
  return trickWinner(fake, trump) === (99 as any);
}

/** Has player p shown a void in suit s (failed to follow s when it was led)? */
function knownVoid(state: GameState, p: PlayerId, s: Suit): boolean {
  for (const trick of state.round.tricks) {
    if (trick.plays.length === 0) continue;
    const led = trick.plays[0].card.suit;
    if (led !== s) continue;
    const play = trick.plays.find((pl) => pl.player === p);
    if (play && play.card.suit !== s) return true;
  }
  // Also check current trick in progress.
  const cur = state.round.currentTrick;
  if (cur && cur.plays.length > 0) {
    const led = cur.plays[0].card.suit;
    if (led === s) {
      const play = cur.plays.find((pl) => pl.player === p);
      if (play && play.card.suit !== s) return true;
    }
  }
  return false;
}

export function aiPlayDecision(state: GameState, player: PlayerId): Card {
  const r: RoundState = state.round;
  const trick = r.currentTrick!;
  const hand = r.hands[player];
  const legal = legalPlays(hand, trick);
  const trump = r.trump;
  const bidder = r.bidder!;
  const partnerCard = r.partnerCard;

  const iAmBidder = player === bidder;
  // I'm a partner if I hold a copy of the called card (we match by suit+rank).
  const iAmPartner = !!partnerCard && hand.some((c) => c.suit === partnerCard.suit && c.rank === partnerCard.rank);
  const onBidderTeam = iAmBidder || iAmPartner;

  const knownPartners = new Set<PlayerId>(r.revealedPartners ?? []);

  const pointsInTrickSoFar = trick.plays.reduce((s, p) => s + cardPoints(p.card), 0);
  const currentWinnerPlayer = trick.plays.length > 0 ? trickWinner(trick, trump) : undefined;
  const winnerIsTeammate =
    currentWinnerPlayer !== undefined &&
    onBidderTeam &&
    (currentWinnerPlayer === bidder || knownPartners.has(currentWinnerPlayer));
  const opponentLeading = currentWinnerPlayer !== undefined && !winnerIsTeammate && currentWinnerPlayer !== player;

  // 1) LEADING the trick
  if (trick.plays.length === 0) {
    if (onBidderTeam) {
      // Playbook #19: lead high trump to drain opponents.
      const trumps = legal.filter((c) => c.suit === trump);
      const highTrumps = trumps.filter((c) => c.rank >= 13);
      if (trumps.length >= 3 && highTrumps.length > 0) return highest(highTrumps);

      // Otherwise top of a side suit I control (Ace of my longest side suit).
      const sideAces = legal.filter((c) => c.suit !== trump && c.rank === 14);
      if (sideAces.length > 0) {
        // Among Aces, prefer the one in my longest side suit.
        sideAces.sort((a, b) =>
          legal.filter((c) => c.suit === b.suit).length - legal.filter((c) => c.suit === a.suit).length
        );
        // Playbook #21: avoid leading the called partner card (don't reveal team).
        const nonPartner = sideAces.find((c) => !partnerCard || c.suit !== partnerCard.suit || c.rank !== partnerCard.rank);
        return nonPartner ?? sideAces[0];
      }
      const safeHighs = legal
        .filter((c) => c.suit !== trump && cardPoints(c) === 0 && c.rank >= 12)
        .sort((a, b) => b.rank - a.rank);
      if (safeHighs.length > 0) return safeHighs[0];
      return highest(legal);
    } else {
      // Playbook #20: as opponent of bidder, lead away from trump in suits where bidder
      // might be void. If we don't know, lead low non-trump non-point.
      const bidderVoidSuits = SUITS.filter((s) => s !== trump && knownVoid(state, bidder, s));
      for (const s of bidderVoidSuits) {
        const inSuit = legal.filter((c) => c.suit === s).sort((a, b) => b.rank - a.rank);
        if (inSuit.length > 0) return inSuit[0]; // top of bidder's void
      }
      // Otherwise: lead a side suit Ace I hold (force the bidder to commit / ruff).
      const sideAces = legal.filter((c) => c.suit !== trump && c.rank === 14);
      if (sideAces.length > 0) {
        // Avoid leading the partner card if I happen to hold it.
        const nonPartner = sideAces.find((c) => !partnerCard || c.suit !== partnerCard.suit || c.rank !== partnerCard.rank);
        if (nonPartner) return nonPartner;
      }
      const safeLows = legal
        .filter((c) => c.suit !== trump && cardPoints(c) === 0)
        .sort((a, b) => a.rank - b.rank);
      if (safeLows.length > 0) return safeLows[0];
      return lowest(legal);
    }
  }

  // 2) FOLLOWING — decide whether to win.
  const winners = legal.filter((c) => wouldWinTrickIfTopSoFar(trick, c, trump));
  const losers = legal.filter((c) => !wouldWinTrickIfTopSoFar(trick, c, trump));
  const trickIsLast = trick.plays.length === 4;

  if (winnerIsTeammate) {
    // Playbook #16: smear high-point cards to teammate's winning trick.
    const pointCards = legal.filter((c) => cardPoints(c) > 0).sort((a, b) => cardPoints(b) - cardPoints(a));
    if (pointCards.length > 0) {
      // Prefer side suits to avoid burning trump.
      const sideSmear = pointCards.find((c) => c.suit !== trump);
      if (sideSmear) return sideSmear;
      return pointCards[0];
    }
    // No points to give — dump the lowest non-trump.
    const dump = losers.length ? losers : legal;
    return cheapestLoser(dump);
  }

  if (opponentLeading && pointsInTrickSoFar >= 15) {
    // High-value trick — try to win.
    if (winners.length > 0) return cheapestWinner(winners);
    // Playbook #17: as opponent, never concentrate points if we can avoid it. Dump worthless card.
    return cheapestLoser(losers.length ? losers : legal);
  }

  if (opponentLeading) {
    // Modest pot. Only commit if last to play and we can win for cheap.
    if (trickIsLast && winners.length > 0 && pointsInTrickSoFar >= 5) {
      return cheapestWinner(winners);
    }
    // Playbook #18: defensive dump worthless card.
    return cheapestLoser(losers.length ? losers : legal);
  }

  // We're following a teammate or middle trick — play to maximize team capture if bidder team.
  if (winners.length > 0 && (onBidderTeam || pointsInTrickSoFar >= 10)) {
    return cheapestWinner(winners);
  }
  return cheapestLoser(losers.length ? losers : legal);
}

function highest(cards: Card[]): Card {
  return cards.slice().sort((a, b) => b.rank - a.rank)[0];
}
function lowest(cards: Card[]): Card {
  return cards.slice().sort((a, b) => a.rank - b.rank)[0];
}
function cheapestWinner(cards: Card[]): Card {
  return cards.slice().sort((a, b) => a.rank - b.rank || cardPoints(a) - cardPoints(b))[0];
}
function cheapestLoser(cards: Card[]): Card {
  return cards.slice().sort((a, b) => cardPoints(a) - cardPoints(b) || a.rank - b.rank)[0];
}
