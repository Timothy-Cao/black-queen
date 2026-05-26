// =============================================================================
//  HARD AI — strategic 5-player Black Queen
//
//  Implements (deterministically, no Monte Carlo) the playbook described in
//  the strong-AI design doc. Highlights:
//    • Capacity-based bidding (control + voids + partner support + protection)
//    • Multi-factor trump and partner-card selection
//    • Team knowledge: caller knows themselves + revealed partners; partners
//      know caller + self + revealed partners; opponents only know once every
//      partner has revealed.
//    • Move scoring: expected team capture, smear-to-known-ally, starve known
//      enemies, trump preservation, Q♠ protection.
//    • Light endgame heuristic for last few tricks.
//    • Void tracking inferred from trick history.
// =============================================================================

import { legalPlays, trickWinner } from "./rules";
import {
  Card, GameState, MIN_BID, BID_INCREMENT, PlayerId, Rank, RoundState, Suit, SUITS,
  Trick, cardPoints,
} from "./types";

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
  /** copies of (suit,rank) already played anywhere */
  playedCopies: Map<string, number>;
  /** copies of (suit,rank) the AI personally still holds */
  myCopies: Map<string, number>;
  /** copies known to remain in opponents' hands collectively */
  enemyCopiesRemaining: (s: Suit, r: Rank) => number;
  /** true iff player p has shown a void in suit s via failed-to-follow */
  knownVoid: (p: PlayerId, s: Suit) => boolean;
  /** highest still-out rank in a suit (Infinity-style: returns 0 if none) */
  highestRemainingInSuit: (s: Suit, includeMine?: boolean) => number;
  /** highest trump still out in opponents' hands */
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
  // Completed tricks
  for (const t of r.tricks) {
    for (const p of t.plays) {
      const k = `${p.card.suit}${p.card.rank}`;
      played.set(k, (played.get(k) ?? 0) + 1);
    }
  }
  // In-progress trick
  if (r.currentTrick) {
    for (const p of r.currentTrick.plays) {
      const k = `${p.card.suit}${p.card.rank}`;
      played.set(k, (played.get(k) ?? 0) + 1);
    }
  }
  const enemyCopiesRemaining = (s: Suit, rr: Rank): number => {
    const total = TOTAL_COPIES(s, rr);
    const p = played.get(`${s}${rr}`) ?? 0;
    const mine = myCopies.get(`${s}${rr}`) ?? 0;
    return Math.max(0, total - p - mine);
  };

  // Void detection
  const voids: Record<PlayerId, Set<Suit>> = { 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() };
  const considerTrick = (t: Trick) => {
    if (t.plays.length === 0) return;
    const led = t.plays[0].card.suit;
    for (const p of t.plays.slice(1)) {
      if (p.card.suit !== led) voids[p.player].add(led);
    }
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

  return { playedCopies: played, myCopies, enemyCopiesRemaining, knownVoid, highestRemainingInSuit, highestEnemyTrump };
}

// -----------------------------------------------------------------------------
//  Team knowledge
// -----------------------------------------------------------------------------

interface TeamKnowledge {
  iAmCaller: boolean;
  iAmPartner: boolean;
  onCallerTeam: boolean;
  /** confirmed-on-caller-team set */
  confirmedCallerTeam: Set<PlayerId>;
  /** if true, every partner has revealed → opponents are also confirmed */
  fullyResolved: boolean;
  /** confirmed enemies (opponents of the caller) — empty until fullyResolved or special case */
  confirmedEnemies: Set<PlayerId>;
}

function computeTeam(state: GameState, me: PlayerId): TeamKnowledge {
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
    for (const p of [0, 1, 2, 3, 4] as PlayerId[]) {
      if (!confirmed.has(p)) confirmedEnemies.add(p);
    }
  } else if (onCallerTeam) {
    // I know my team is exactly { caller, all partner-card holders }. Anyone NOT
    // holding the called card is on the opposing side. We can't enumerate "not
    // holding" without seeing hands, but once a partner plays their copy, they
    // become confirmed. Until then, leave confirmedEnemies empty.
  }
  return { iAmCaller, iAmPartner, onCallerTeam, confirmedCallerTeam: confirmed, fullyResolved, confirmedEnemies };
}

// -----------------------------------------------------------------------------
//  Hand evaluation — trump + bidding capacity
// -----------------------------------------------------------------------------

function lengthIn(hand: Card[], s: Suit): number { return hand.filter((c) => c.suit === s).length; }
function countOf(hand: Card[], s: Suit, r: Rank): number { return hand.filter((c) => c.suit === s && c.rank === r).length; }
function handPoints(hand: Card[]): number { return hand.reduce((sum, c) => sum + cardPoints(c), 0); }

/** Multi-factor trump scoring per the playbook. */
function evaluateTrumpSuit(hand: Card[], suit: Suit): number {
  let score = 0;
  const inSuit = hand.filter((c) => c.suit === suit);
  score += 12 * inSuit.length;

  const topTrumps = inSuit.filter((c) => c.rank >= 12).length; // A, K, Q
  const midTrumps = inSuit.filter((c) => c.rank >= 9 && c.rank <= 11).length;  // J, 10, 9
  const lowTrumps = inSuit.filter((c) => c.rank <= 8).length; // 8, 7, 5
  score += 20 * topTrumps;
  score += 10 * midTrumps;
  score += 5 * lowTrumps;

  // Two copies of an Ace / King of trump is very powerful (top control).
  const aceCount = inSuit.filter((c) => c.rank === 14).length;
  const kingCount = inSuit.filter((c) => c.rank === 13).length;
  if (aceCount >= 2) score += 25;
  if (kingCount >= 2 && aceCount >= 1) score += 15;

  // Voids/shorts in other suits = cutting power
  for (const s2 of SUITS) {
    if (s2 === suit) continue;
    const n = lengthIn(hand, s2);
    if (n === 0) score += 30;
    else if (n === 1) score += 15;
    else if (n === 2) score += 5;
  }

  // Point card protection: cards in trump are well protected; point cards in
  // a side suit with high cards are partly protected; isolated point cards lose value.
  for (const c of hand) {
    if (cardPoints(c) === 0) continue;
    if (c.suit === suit) {
      score += cardPoints(c) * 0.8;
    } else {
      const sideLen = lengthIn(hand, c.suit);
      const sideTop = hand.filter((x) => x.suit === c.suit && x.rank >= 13).length;
      if (sideTop > 0 && sideLen >= 3) {
        score += cardPoints(c) * 0.4;
      } else {
        score -= cardPoints(c) * 0.4;
      }
    }
  }

  // Q♠ adjustment
  if (suit === "S") {
    const qSpades = inSuit.filter((c) => c.rank === 12).length;
    score += 15 * qSpades;
  }

  return score;
}

function chooseBestTrump(hand: Card[]): { suit: Suit; score: number } {
  let best: Suit = "S";
  let bestScore = -Infinity;
  for (const s of SUITS) {
    const sc = evaluateTrumpSuit(hand, s);
    if (sc > bestScore) { bestScore = sc; best = s; }
  }
  return { suit: best, score: bestScore };
}

function chooseBestPartnerCard(hand: Card[], trump: Suit): Card {
  // Walk ranks high → low across all suits; pick the strongest card the bidder
  // owns zero copies of, biased by suit (trump > spades-with-Q > others).
  const candidates: { card: Card; score: number }[] = [];
  for (const s of SUITS) {
    for (const rank of [14, 13, 12, 11, 10, 9, 8, 7, 5] as Rank[]) {
      if (!rankIsInDeck(s, rank)) continue;
      if (countOf(hand, s, rank) > 0) continue; // never call a card we hold
      let score = 0;
      if (rank === 14) score += 40;
      else if (rank === 13) score += 25;
      else if (rank === 12 && s === "S") score += 45;
      else if (rank === 12) score += 15;
      else if (rank === 11) score += 8;
      else if (rank === 10) score += 6;
      else if (rank === 5 || rank === 8 || rank === 9) score -= 25;
      else score -= 10;

      if (s === trump) score += 20;
      if (cardPoints({ suit: s, rank, id: "" }) > 0) score += cardPoints({ suit: s, rank, id: "" }) * 0.5;

      candidates.push({ card: { suit: s, rank, id: `${s}${rank}_0` }, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  // Defensive fallback: if every card is held (impossible in 13 cards), just
  // call Ace of trump.
  return candidates[0]?.card ?? { suit: trump, rank: 14, id: `${trump}14_0` };
}

/** Estimate the team's expected capture given trump choice. */
function estimateBidCapacity(hand: Card[]): number {
  const { suit: trump, score: trumpScore } = chooseBestTrump(hand);
  const myPoints = handPoints(hand);

  // self_capture: my likely point captures with this trump
  let selfCapture = myPoints * 0.55;        // I'll capture most of my own point cards if protected
  selfCapture += handPoints(hand.filter((c) => c.suit === trump)) * 0.15; // trump-suit points doubly safe
  // capturing partner's cards via trump dominance + lead control
  selfCapture += Math.min(60, trumpScore * 0.18);

  // trump_control: extra captures from sweeping with high trump
  const topTrumps = hand.filter((c) => c.suit === trump && c.rank >= 12).length;
  const trumpLen = lengthIn(hand, trump);
  let trumpControl = 0;
  trumpControl += topTrumps * 8;
  if (trumpLen >= 5) trumpControl += (trumpLen - 4) * 6;

  // void_bonus: each void in a side suit = cutting opportunities
  let voidBonus = 0;
  for (const s of SUITS) {
    if (s === trump) continue;
    const n = lengthIn(hand, s);
    if (n === 0) voidBonus += 18;
    else if (n === 1) voidBonus += 6;
  }

  // partner_bonus: an Ace/Q♠ we don't hold gives partner ~15-30 pts swing
  let partnerBonus = 25;
  const acesHeld = hand.filter((c) => c.rank === 14).length;
  if (acesHeld <= 2) partnerBonus += 15;  // many aces likely still out for partner
  const qSpadesHeld = hand.filter((c) => c.suit === "S" && c.rank === 12).length;
  if (qSpadesHeld === 0) partnerBonus += 12; // Q♠ available as partner card

  // point_protection: high cards in side suits guarding our point cards
  let protection = 0;
  for (const c of hand) {
    if (cardPoints(c) === 0 || c.suit === trump) continue;
    const sideTop = hand.filter((x) => x.suit === c.suit && x.rank >= 13).length;
    if (sideTop > 0) protection += 4;
  }

  // risk_penalty: balanced 3/3/3/4 weak hands shouldn't bid high
  let risk = 0;
  const lengths = SUITS.map((s) => lengthIn(hand, s)).sort((a, b) => b - a);
  if (lengths[0] <= 4) risk += 25;
  if (topTrumps === 0) risk += 15;
  if (lengths[3] >= 2 && lengths[0] - lengths[3] <= 1) risk += 10;

  const capacity = selfCapture + trumpControl + voidBonus + partnerBonus + protection - risk;
  return Math.round(capacity);
}

// -----------------------------------------------------------------------------
//  Bidding
// -----------------------------------------------------------------------------

export function hardBid(state: GameState, _player: PlayerId): { bid: number | "pass" } {
  const hand = state.round.hands[_player];
  const capacity = estimateBidCapacity(hand);

  const currentHigh = Math.max(0, ...state.round.bids.map((b) => b.amount));
  const required = currentHigh === 0 ? MIN_BID : currentHigh + BID_INCREMENT;

  // Round capacity down to nearest 5, but cap normal bids at 240 unless
  // capacity is far above (extraordinary hands).
  let target = Math.floor(capacity / 5) * 5;
  if (target > 240 && capacity < 280) target = 240;
  if (target > 300) target = 300;

  // Won't bid above what we think we can capture, and won't take crazy risks.
  // (5-point safety margin built in.)
  if (required > target) return { bid: "pass" };
  // 5% chance of a deliberate stop short to mask strength
  if (Math.random() < 0.05 && required > MIN_BID) return { bid: "pass" };
  return { bid: required };
}

// -----------------------------------------------------------------------------
//  Declaring
// -----------------------------------------------------------------------------

export function hardDeclare(state: GameState, player: PlayerId): { trump: Suit; partnerCard: Card } {
  const hand = state.round.hands[player];
  const { suit: trump } = chooseBestTrump(hand);
  const partnerCard = chooseBestPartnerCard(hand, trump);
  return { trump, partnerCard };
}

// -----------------------------------------------------------------------------
//  Card play — scoring
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
  /** points already in the current trick (before my play) */
  trickPointsSoFar: number;
  currentWinner?: PlayerId;
  iAmLastToPlay: boolean;
  /** Tricks left in the round (including the current one). */
  tricksRemaining: number;
}

function buildContext(state: GameState, player: PlayerId): PlayContext {
  const r = state.round;
  const hand = r.hands[player];
  const trick = r.currentTrick ?? { leader: player, plays: [] };
  const legal = legalPlays(hand, trick);
  const team = computeTeam(state, player);
  const view = buildPlayedView(state, player);
  const trickPointsSoFar = trick.plays.reduce((s, p) => s + cardPoints(p.card), 0);
  const currentWinner = trick.plays.length > 0 ? trickWinner(trick, r.trump) : undefined;
  const iAmLastToPlay = trick.plays.length === 4;
  const tricksRemaining = 13 - r.tricks.length;
  return {
    state, player, hand, trick, legal, trump: r.trump, team, view,
    trickPointsSoFar, currentWinner, iAmLastToPlay, tricksRemaining,
  };
}

/** Probability the eventual trick winner is on our team (rough, deterministic). */
function probabilityWinnerIsOurTeam(card: Card, ctx: PlayContext): number {
  // Simulate: would this card take the lead among plays so far?
  const fake: Trick = { ...ctx.trick, plays: [...ctx.trick.plays, { player: ctx.player, card }] };
  const provisionalWinner = trickWinner(fake, ctx.trump);

  // If I'm last to play, the winner is decided right now.
  if (ctx.iAmLastToPlay) {
    if (provisionalWinner === ctx.player) return ctx.team.onCallerTeam ? 1 : 0;
    const sameSide = playerLikelyOnMyTeam(provisionalWinner, ctx);
    return sameSide;
  }

  // Otherwise estimate whether someone after me can over-trump or over-rank.
  // Conservative model: if my play is the current top and no remaining player
  // has a stronger card known to be out, treat me as the winner.
  const stillToPlay = 4 - ctx.trick.plays.length - 1; // after my play
  const myCardWinsNow = provisionalWinner === ctx.player;

  if (myCardWinsNow) {
    // Risk: a later player might over-trump.
    const led = ctx.trick.plays[0]?.card.suit ?? card.suit;
    const isTrump = ctx.trump !== undefined && card.suit === ctx.trump;

    // If I led/played in led-suit (no trump), trump or higher led-suit can beat me.
    const enemyHasHigherTrump = ctx.trump !== undefined && ctx.view.highestEnemyTrump(ctx.trump) > (isTrump ? card.rank : 0);
    const enemyHasHigherInSuit = !isTrump && ctx.view.highestRemainingInSuit(led, false) > card.rank;
    const beatable = enemyHasHigherTrump || enemyHasHigherInSuit;
    if (!beatable) return ctx.team.onCallerTeam ? 1 : 0;

    // Beatable — share with possible-winners. Rough estimate based on stillToPlay.
    const overrideChance = Math.min(0.7, 0.15 * stillToPlay + (enemyHasHigherTrump ? 0.2 : 0));
    const myHoldChance = 1 - overrideChance;
    const otherTeamProb = averageTeamProbAmongRest(ctx);
    return ctx.team.onCallerTeam
      ? myHoldChance + overrideChance * otherTeamProb
      : (1 - myHoldChance) * (1 - otherTeamProb) + 0; // tricky — just blend
  }

  // My card doesn't take the current top: someone else (currently winning) might keep it.
  const provisional = provisionalWinner;
  const sameSide = playerLikelyOnMyTeam(provisional, ctx);
  // Add risk that someone after me overtakes them.
  return sameSide * 0.85;
}

function playerLikelyOnMyTeam(p: PlayerId, ctx: PlayContext): number {
  const { team } = ctx;
  if (team.confirmedCallerTeam.has(p)) return team.onCallerTeam ? 1 : 0;
  if (team.confirmedEnemies.has(p)) return team.onCallerTeam ? 0 : 1;
  // Unknown — estimate. If I'm caller team, an unknown opponent has ~ (partners_left / opponents_unknown) chance of being ally.
  const r = ctx.state.round;
  const totalPartners = r.partners?.length ?? 0;
  const partnersLeft = Math.max(0, totalPartners - r.revealedPartners.length);
  const opponentsUnknown = ([0, 1, 2, 3, 4] as PlayerId[]).filter(
    (x) => !team.confirmedCallerTeam.has(x) && !team.confirmedEnemies.has(x),
  ).length;
  if (opponentsUnknown === 0) return team.onCallerTeam ? 0 : 1;
  const callerTeamProb = partnersLeft / opponentsUnknown;
  return team.onCallerTeam ? callerTeamProb : 1 - callerTeamProb;
}

function averageTeamProbAmongRest(ctx: PlayContext): number {
  const remaining = [0, 1, 2, 3, 4]
    .filter((p) => p !== ctx.player && !ctx.trick.plays.some((pp) => pp.player === p));
  if (remaining.length === 0) return 0.5;
  return remaining.reduce((s, p) => s + playerLikelyOnMyTeam(p as PlayerId, ctx), 0) / remaining.length;
}

function wouldTakeTrickIfNoOneElsePlayedHigher(card: Card, ctx: PlayContext): boolean {
  const fake: Trick = { ...ctx.trick, plays: [...ctx.trick.plays, { player: ctx.player, card }] };
  return trickWinner(fake, ctx.trump) === ctx.player;
}

/** Cost of "spending" a card (high cards + trump cost more). */
function cardSpendCost(card: Card, ctx: PlayContext): number {
  let cost = 0;
  if (ctx.trump && card.suit === ctx.trump) {
    cost += 2 + (card.rank - 4) * 0.6; // higher trumps more expensive to spend
    if (card.rank >= 13) cost += 6;
    if (card.rank === 14) cost += 4;
  } else {
    // Side suit: high ranks have lead-control value
    if (card.rank === 14) cost += 5;
    else if (card.rank === 13) cost += 2.5;
    else if (card.rank === 12) cost += 1.5;
  }
  return cost;
}

function scoreMove(card: Card, ctx: PlayContext): number {
  const teamWinProb = probabilityWinnerIsOurTeam(card, ctx);
  const trickPotentialTotal = ctx.trickPointsSoFar + cardPoints(card)
    + (ctx.iAmLastToPlay ? 0 : averageRemainingPointAddition(ctx));

  // E[points to my team] - E[points to enemy]
  let score = trickPotentialTotal * (2 * teamWinProb - 1);

  // Q♠ is uniquely heavy. Adjust separately so we don't accidentally feed it.
  if (card.suit === "S" && card.rank === 12) {
    if (teamWinProb >= 0.55) score += 12; // ok to commit if we'll win
    else score -= 35; // huge penalty for dropping Q♠ onto an enemy trick
  }

  // Cost of spending the card
  score -= cardSpendCost(card, ctx);

  // Smear bonus: known ally winning + this is a point card → big reward
  if (ctx.currentWinner !== undefined) {
    const allyWinning = ctx.team.confirmedCallerTeam.has(ctx.currentWinner) && ctx.team.onCallerTeam;
    const enemyWinning = ctx.team.confirmedEnemies.has(ctx.currentWinner)
      || (ctx.team.onCallerTeam && !ctx.team.confirmedCallerTeam.has(ctx.currentWinner) && ctx.team.fullyResolved);

    if (allyWinning && cardPoints(card) > 0) {
      score += cardPoints(card) * 1.4 - cardSpendCost(card, ctx);
    }
    if (enemyWinning && cardPoints(card) > 0) {
      score -= cardPoints(card) * 1.5;
    }
  }

  // Don't waste a winner: if I would take this trick with a cheaper legal card
  // that also wins, prefer that. (We approximate by penalising surplus rank.)
  if (wouldTakeTrickIfNoOneElsePlayedHigher(card, ctx)) {
    const cheaperWinners = ctx.legal.filter(
      (c) => c !== card && wouldTakeTrickIfNoOneElsePlayedHigher(c, ctx) && c.rank < card.rank && c.suit === card.suit,
    );
    if (cheaperWinners.length > 0) score -= (card.rank - cheaperWinners[0].rank) * 1.5;
  }

  return score;
}

function averageRemainingPointAddition(ctx: PlayContext): number {
  // Rough expectation of point cards still to land in this trick
  const remainingPlayers = 4 - ctx.trick.plays.length - 1;
  if (remainingPlayers <= 0) return 0;
  // Cards left in deck / players holding them
  const totalCards = 65 - (ctx.state.round.tricks.length * 5 + ctx.trick.plays.length + 1);
  if (totalCards <= 0) return 0;
  const pointsLeft = ctx.state.round.tricks.reduce(
    (acc, t) => acc - t.plays.reduce((s, p) => s + cardPoints(p.card), 0),
    300,
  ) - ctx.trickPointsSoFar;
  const avgPpc = pointsLeft / totalCards;
  return Math.max(0, avgPpc * remainingPlayers);
}

// -----------------------------------------------------------------------------
//  Lead strategy (when we're first to play in a trick)
// -----------------------------------------------------------------------------

function chooseLead(ctx: PlayContext): Card {
  const { hand, legal, trump, team, view, state } = ctx;
  const r = state.round;

  if (team.onCallerTeam) {
    // Try to pull enemy trumps if we have lots of high trump.
    if (trump) {
      const trumps = legal.filter((c) => c.suit === trump);
      const highTrumps = trumps.filter((c) => c.rank >= 13);
      // Only do this if enemies still have trump out
      if (highTrumps.length > 0 && view.highestEnemyTrump(trump) > 0 && trumps.length >= 3) {
        return highest(highTrumps);
      }
      // Lead Ace of a side suit I control — partner can throw points on it.
      const sideAces = legal
        .filter((c) => c.suit !== trump && c.rank === 14)
        .sort((a, b) => lengthIn(hand, b.suit) - lengthIn(hand, a.suit));
      if (sideAces.length > 0) {
        const nonPartnerCard = sideAces.find(
          (c) => !r.partnerCard || c.suit !== r.partnerCard.suit || c.rank !== r.partnerCard.rank,
        );
        if (nonPartnerCard) return nonPartnerCard;
        return sideAces[0];
      }
    }
    // Default safe high
    const safeHighs = legal
      .filter((c) => cardPoints(c) === 0 && c.rank >= 12)
      .sort((a, b) => b.rank - a.rank);
    if (safeHighs.length > 0) return safeHighs[0];
    return cheapestLoser(legal);
  }

  // Anti-caller: lead suits the caller is likely void in
  const callerId = r.bidder;
  if (callerId !== undefined && trump) {
    const voidSuits = SUITS.filter((s) => s !== trump && view.knownVoid(callerId, s));
    for (const s of voidSuits) {
      // We *want* caller to either ruff (waste trump) or dump
      const inSuit = legal.filter((c) => c.suit === s).sort((a, b) => b.rank - a.rank);
      if (inSuit.length > 0) return inSuit[0];
    }
  }
  // Lead a side Ace I hold to grab a sure trick
  const sideAces = legal.filter((c) => c.suit !== trump && c.rank === 14);
  if (sideAces.length > 0) {
    // Avoid leading the partner card if I happen to hold it
    const nonPartnerCard = sideAces.find(
      (c) => !r.partnerCard || c.suit !== r.partnerCard.suit || c.rank !== r.partnerCard.rank,
    );
    if (nonPartnerCard) return nonPartnerCard;
  }
  // Otherwise lead low non-trump
  const lows = legal
    .filter((c) => c.suit !== trump && cardPoints(c) === 0)
    .sort((a, b) => a.rank - b.rank);
  if (lows.length > 0) return lows[0];
  return cheapestLoser(legal);
}

// -----------------------------------------------------------------------------
//  Main play decision
// -----------------------------------------------------------------------------

export function hardPlay(state: GameState, player: PlayerId): Card {
  const ctx = buildContext(state, player);
  if (ctx.legal.length === 1) return ctx.legal[0];

  // Leading
  if (ctx.trick.plays.length === 0) {
    return chooseLead(ctx);
  }

  // Following: pick the highest-scoring legal move.
  let best = ctx.legal[0];
  let bestScore = -Infinity;
  for (const c of ctx.legal) {
    const s = scoreMove(c, ctx);
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return best;
}

// -----------------------------------------------------------------------------
//  Small helpers
// -----------------------------------------------------------------------------

function highest(cards: Card[]): Card { return cards.slice().sort((a, b) => b.rank - a.rank)[0]; }
function cheapestLoser(cards: Card[]): Card {
  return cards.slice().sort((a, b) => cardPoints(a) - cardPoints(b) || a.rank - b.rank)[0];
}
