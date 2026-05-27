import { buildDeck5p, deal5pLight, shuffle, handSort } from "./deck";
import { isLegalPlay, nextPlayer, trickPoints, trickWinner } from "./rules";
import {
  Bid, Card, GameLogEntry, GameState, MIN_BID, Player, PlayerId,
  RoundState, ShuffleMode, Suit, Trick, RANK_LABEL, SUIT_GLYPHS,
} from "./types";

// Random offset survives HMR resets so log entry IDs don't collide with stale state.
let logCounter = Math.floor(Math.random() * 1_000_000_000);

export function freshGame(
  playerConfigs: { name: string; isAI: boolean; aiPersonality?: import("./types").AIPersonality }[],
  targetScore = 300,
  shuffleMode: ShuffleMode = "light",
  shuffleIntensity?: number,
): GameState {
  if (playerConfigs.length !== 5) throw new Error("Need 5 players");
  const players: Player[] = playerConfigs.map((p, i) => ({
    id: i as PlayerId,
    name: p.name,
    isAI: p.isAI,
    aiPersonality: p.aiPersonality,
    hand: [],
    tricksWon: [],
    scoreTotal: 0,
  }));
  // shuffleIntensity is the canonical control (0..1). When the caller only
  // passed legacy shuffleMode, derive intensity from it.
  const intensity = shuffleIntensity !== undefined
    ? Math.max(0, Math.min(1, shuffleIntensity))
    : (shuffleMode === "full" ? 1 : 0);
  // Round 1: pick a random dealer; the dealer starts the bidding.
  const firstDealer = Math.floor(Math.random() * 5) as PlayerId;
  const round = startRound(players, firstDealer, 1, intensity);
  const intensityLabel = intensity <= 0.05 ? "light"
    : intensity >= 0.95 ? "full"
    : `${Math.round(intensity * 100)}%`;
  return {
    players,
    round,
    history: [],
    targetScore,
    phase: round.phase,
    log: [logEntry("info", `Game started — first to ${targetScore} points wins. Shuffle: ${intensityLabel}.`)],
    shuffleMode,
    shuffleIntensity: intensity,
  };
}

export function startRound(players: Player[], dealer: PlayerId, roundNumber: number, shuffleIntensity = 0): RoundState {
  const deck = shuffle(buildDeck5p());
  const hands = deal5pLight(deck, shuffleIntensity);
  const handsMap = {} as Record<PlayerId, Card[]>;
  for (let i = 0; i < 5; i++) {
    handsMap[i as PlayerId] = hands[i];
    players[i].hand = hands[i];
    players[i].tricksWon = [];
  }
  // Dealer = first bidder. (Game rules: caller of round N becomes dealer of round N+1.)
  return {
    roundNumber,
    dealer,
    hands: handsMap,
    bids: [],
    passed: new Set<PlayerId>(),
    partnerRevealed: false,
    revealedPartners: [],
    tricks: [],
    toPlay: dealer,
    phase: "bidding",
    bidTurn: dealer,
  };
}

export function logEntry(kind: GameLogEntry["kind"], text: string): GameLogEntry {
  return { id: ++logCounter, kind, text };
}

export function cardLabel(c: Card): string {
  return `${RANK_LABEL[c.rank]}${SUIT_GLYPHS[c.suit]}`;
}

// ----- Bidding -----

export function highestBid(round: RoundState): number {
  let max = 0;
  for (const b of round.bids) if (b.amount > max) max = b.amount;
  return max;
}

export function currentBidder(round: RoundState): PlayerId | undefined {
  return round.bidTurn;
}

/** Returns next eligible bidder after p, or undefined if bidding closed */
function nextBidder(round: RoundState, after: PlayerId): PlayerId | undefined {
  let cur = nextPlayer(after);
  for (let i = 0; i < 5; i++) {
    if (!round.passed.has(cur)) return cur;
    cur = nextPlayer(cur);
  }
  return undefined;
}

export function legalBidAmount(round: RoundState): { min: number; max: number } {
  const hi = highestBid(round);
  const min = hi === 0 ? MIN_BID : hi + 5;
  return { min, max: 300 };
}

export function applyBid(state: GameState, player: PlayerId, amount: number): GameState {
  const r = state.round;
  if (r.phase !== "bidding") return state;
  if (r.bidTurn !== player) return state;
  const { min, max } = legalBidAmount(r);
  if (amount < min || amount > max) return state;
  const bid: Bid = { player, amount };
  const log = [...state.log, logEntry("bid", `${state.players[player].name} bids ${amount}.`)];
  const newRound: RoundState = {
    ...r,
    bids: [...r.bids, bid],
  };
  return advanceBidTurn({ ...state, round: newRound, log });
}

export function applyPass(state: GameState, player: PlayerId): GameState {
  const r = state.round;
  if (r.phase !== "bidding") return state;
  if (r.bidTurn !== player) return state;
  const passed = new Set(r.passed);
  passed.add(player);
  const log = [...state.log, logEntry("bid", `${state.players[player].name} passes.`)];
  const newRound: RoundState = { ...r, passed };
  return advanceBidTurn({ ...state, round: newRound, log });
}

function advanceBidTurn(state: GameState): GameState {
  const r = state.round;
  const active = ([0,1,2,3,4] as PlayerId[]).filter((p) => !r.passed.has(p));
  const hi = highestBid(r);

  // If only one active player remains AND there is at least one bid -> they win.
  if (active.length === 1 && hi > 0) {
    const winner = active[0];
    return enterDeclaring(state, winner, hi);
  }
  // If everyone passed and no bid -> redeal
  if (active.length === 0 && hi === 0) {
    return redealRound(state);
  }
  // If only one active and no bids yet, they could just take the minimum or still pass.
  // (Standard: bidding requires 5 passes after a bid; if no bid yet, last active must bid min).
  // For simplicity: if active.length===1 and hi===0, force them to bid min on their turn.

  // Find next eligible bidder
  const cur = r.bidTurn!;
  const next = nextBidder(r, cur);
  return { ...state, round: { ...r, bidTurn: next } };
}

function redealRound(state: GameState): GameState {
  const log = [...state.log, logEntry("system", `Everyone passed. Redealing...`)];
  const round = startRound(state.players, state.round.dealer, state.round.roundNumber, state.shuffleIntensity ?? 0);
  return { ...state, round, log, phase: round.phase };
}

function enterDeclaring(state: GameState, bidder: PlayerId, amount: number): GameState {
  const log = [...state.log, logEntry("bid", `${state.players[bidder].name} is the caller at ${amount}.`)];
  return {
    ...state,
    phase: "declaring",
    round: {
      ...state.round,
      phase: "declaring",
      bidder,
      winningBid: amount,
      bidTurn: undefined,
    },
    log,
  };
}

// ----- Declaring -----

/** Number of copies of (rank+suit) the bidder holds. Bidder cannot call a card they own ALL copies of. */
export function bidderCopiesOf(state: GameState, suit: Suit, rank: number): number {
  const bidder = state.round.bidder;
  if (bidder === undefined) return 0;
  return state.round.hands[bidder].filter((c) => c.suit === suit && c.rank === rank).length;
}

/** Total copies of (rank+suit) in the deck — 1 for 7♠, 2 otherwise. */
export function totalCopiesOf(suit: Suit, rank: number): number {
  if (suit === "S" && rank === 7) return 1;
  return 2;
}

export function applyDeclare(state: GameState, trump: Suit, partnerCard: Card): GameState {
  const r = state.round;
  if (r.phase !== "declaring") return state;
  const bidder = r.bidder!;
  // Rule: bidder cannot own ALL copies of the called card.
  const total = totalCopiesOf(partnerCard.suit, partnerCard.rank);
  const owned = bidderCopiesOf(state, partnerCard.suit, partnerCard.rank);
  if (owned >= total) return state;

  // Partners = all OTHER players who hold a copy of (suit+rank).
  const partners: PlayerId[] = ([0, 1, 2, 3, 4] as PlayerId[]).filter(
    (p) => p !== bidder && r.hands[p].some((c) => c.suit === partnerCard.suit && c.rank === partnerCard.rank),
  );

  const log = [
    ...state.log,
    logEntry("reveal", `${state.players[bidder].name} calls ${cardLabel(partnerCard)} on ${SUIT_GLYPHS[trump]}.`),
  ];
  return {
    ...state,
    phase: "playing",
    round: {
      ...r,
      trump,
      partnerCard,
      partners,
      partnerRevealed: false,
      revealedPartners: [],
      phase: "playing",
      toPlay: bidder, // bidder leads first trick
      currentTrick: { leader: bidder, plays: [] },
    },
    log,
  };
}

// ----- Playing -----

export function applyPlay(state: GameState, player: PlayerId, card: Card): GameState {
  const r = state.round;
  if (r.phase !== "playing") return state;
  if (r.toPlay !== player) return state;
  const hand = r.hands[player];
  if (!isLegalPlay(card, hand, r.currentTrick)) return state;

  const newHand = hand.filter((c) => c.id !== card.id);
  const handsMap = { ...r.hands, [player]: newHand };

  const trick: Trick = r.currentTrick ?? { leader: player, plays: [] };
  const newTrick: Trick = { ...trick, plays: [...trick.plays, { player, card }] };

  const log = [...state.log, logEntry("trick", `${state.players[player].name} plays ${cardLabel(card)}.`)];

  // Partner reveal: only when a NON-bidder plays the called (suit+rank).
  // The bidder playing their own copy doesn't reveal anything (everyone knows the bidder).
  let partnerRevealed = r.partnerRevealed;
  let revealedPartners = r.revealedPartners;
  let partnerLog: GameLogEntry[] = [];
  if (r.partnerCard && card.suit === r.partnerCard.suit && card.rank === r.partnerCard.rank) {
    if (player === r.bidder) {
      partnerLog = [logEntry("reveal", `${state.players[player].name} plays own ${cardLabel(card)}.`)];
    } else if (!revealedPartners.includes(player)) {
      revealedPartners = [...revealedPartners, player];
      partnerRevealed = true;
      partnerLog = [logEntry("reveal", `${state.players[player].name} is a partner!`)];
    }
  }

  // sync player hand
  const players = state.players.map((p) =>
    p.id === player ? { ...p, hand: newHand } : p,
  );

  // Trick complete? Hold for UI pause.
  if (newTrick.plays.length === 5) {
    const winner = trickWinner(newTrick, r.trump);
    const pts = trickPoints(newTrick);
    const trickLog = logEntry("trick", `${state.players[winner].name} wins the trick (+${pts} pts).`);
    return {
      ...state,
      players,
      round: {
        ...r,
        hands: handsMap,
        currentTrick: { ...newTrick, winner, points: pts },
        partnerRevealed,
        revealedPartners,
        pendingTrickComplete: true,
        lastTrickWinner: winner,
      },
      log: [...log, ...partnerLog, trickLog],
    };
  }

  // Trick continues
  return {
    ...state,
    players,
    round: {
      ...r,
      hands: handsMap,
      currentTrick: newTrick,
      toPlay: nextPlayer(player),
      partnerRevealed,
      revealedPartners,
    },
    log: [...log, ...partnerLog],
  };
}

function finishRound(state: GameState): GameState {
  const r = state.round;
  const bidder = r.bidder!;
  const partners = r.partners ?? [];
  const winBid = r.winningBid!;

  // Sum captured points by player
  const roundPoints: Record<PlayerId, number> = {0:0,1:0,2:0,3:0,4:0};
  for (const t of r.tricks) {
    const w = t.winner!;
    roundPoints[w] += t.points!;
  }
  const team = new Set<PlayerId>([bidder, ...partners]);
  const teamPoints = ([0,1,2,3,4] as PlayerId[])
    .filter((p) => team.has(p))
    .reduce<number>((s, p) => s + roundPoints[p], 0);
  const made = teamPoints >= winBid;
  const delta: Record<PlayerId, number> = {0:0,1:0,2:0,3:0,4:0};
  const sign = made ? 1 : -1;
  for (const p of team) delta[p] = sign * winBid;

  const players = state.players.map((p) => ({
    ...p,
    scoreTotal: p.scoreTotal + (delta[p.id] || 0),
  }));

  const teamNames = ([bidder, ...partners] as PlayerId[]).map((p) => state.players[p].name).join(" + ");
  const log = [
    ...state.log,
    logEntry(
      "score",
      `Round ${r.roundNumber}: ${teamNames} captured ${teamPoints} (bid ${winBid}) — ${made ? "MADE" : "FAILED"} → ${sign > 0 ? "+" : ""}${sign * winBid}.`,
    ),
  ];

  // Single-game model: every finished round is the end of the game.
  // "Play Again" returns to the lobby for a fresh deal.
  return {
    ...state,
    players,
    round: { ...r, roundPoints, deltaScores: delta, phase: "round_end" },
    phase: "game_end",
    log,
  };
}

export function collectTrick(state: GameState): GameState {
  const r = state.round;
  if (!r.pendingTrickComplete || r.currentTrick?.winner === undefined) return state;
  const winner = r.currentTrick.winner;
  const completed = r.currentTrick;
  const tricks = [...r.tricks, completed];
  const wonCards = completed.plays.map((tp) => tp.card);
  const players = state.players.map((p) =>
    p.id === winner ? { ...p, tricksWon: [...p.tricksWon, ...wonCards] } : p,
  );

  // Round complete?
  if (players.every((p) => p.hand.length === 0)) {
    return finishRound({
      ...state,
      players,
      round: {
        ...r,
        tricks,
        currentTrick: undefined,
        pendingTrickComplete: false,
        phase: "round_end",
      },
    });
  }
  return {
    ...state,
    players,
    round: {
      ...r,
      tricks,
      currentTrick: { leader: winner, plays: [] },
      toPlay: winner,
      pendingTrickComplete: false,
    },
  };
}

export function startNextRound(state: GameState): GameState {
  const history = [...state.history, state.round];
  // The caller of the round that just finished becomes the next dealer.
  const dealer: PlayerId = state.round.bidder ?? nextPlayer(state.round.dealer);
  const round = startRound(state.players, dealer, state.round.roundNumber + 1, state.shuffleIntensity ?? 0);
  return { ...state, history, round, phase: round.phase, log: [...state.log, logEntry("info", `--- Round ${round.roundNumber} ---`)] };
}

// Util for UI
export function sortHand(cards: Card[]): Card[] {
  return cards.slice().sort(handSort);
}
