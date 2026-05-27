export type Suit = "S" | "H" | "D" | "C";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string; // unique e.g. "S12"
}

export const SUITS: Suit[] = ["S", "H", "D", "C"];
export const SUIT_NAMES: Record<Suit, string> = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };
export const SUIT_GLYPHS: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const SUIT_RED: Record<Suit, boolean> = { S: false, H: true, D: true, C: false };

export const RANK_LABEL: Record<Rank, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10",
  11: "J", 12: "Q", 13: "K", 14: "A",
};

export type PlayerId = 0 | 1 | 2 | 3 | 4;
export const PLAYER_IDS: PlayerId[] = [0, 1, 2, 3, 4];

export type AIPersonality = "normal" | "random" | "hard" | "hard-2" | "hard-3" | "hard-4";

export interface Player {
  id: PlayerId;
  name: string;
  isAI: boolean;
  aiPersonality?: AIPersonality;
  hand: Card[];
  tricksWon: Card[]; // flat list of all captured cards this round
  scoreTotal: number; // cumulative across rounds
}

export type Phase =
  | "lobby"
  | "dealing"
  | "bidding"
  | "declaring" // bidder picking trump + partner card
  | "playing"
  | "round_end"
  | "game_end";

export interface Bid {
  player: PlayerId;
  amount: number; // 75-150, or 0 = pass
}

export interface TrickCard {
  player: PlayerId;
  card: Card;
}

export interface Trick {
  leader: PlayerId;
  plays: TrickCard[];
  winner?: PlayerId;
  points?: number;
}

export interface RoundState {
  roundNumber: number;
  dealer: PlayerId;
  hands: Record<PlayerId, Card[]>;
  bids: Bid[]; // history; last non-pass is winning
  passed: Set<PlayerId>;
  bidder?: PlayerId;
  winningBid?: number;
  trump?: Suit;
  partnerCard?: Card; // the called card (rank+suit; id is one specific copy but only rank+suit matters for matching)
  partners?: PlayerId[]; // ALL players (besides bidder) holding a copy of the called card; can be 1 or 2
  revealedPartners: PlayerId[]; // partners who have played their matching card so far
  partnerRevealed: boolean; // true once ANY partner has been revealed
  currentTrick?: Trick;
  tricks: Trick[];
  toPlay: PlayerId;
  phase: Phase;
  bidTurn?: PlayerId; // whose turn to bid
  // UI pause: when a trick is completed, hold it on the table briefly
  pendingTrickComplete?: boolean;
  lastTrickWinner?: PlayerId;
  // For scoring
  roundPoints?: Record<PlayerId, number>;
  deltaScores?: Record<PlayerId, number>;
}

export type ShuffleMode = "full" | "light";

export interface GameState {
  players: Player[];
  round: RoundState;
  history: RoundState[]; // completed rounds
  targetScore: number; // first to N wins (e.g., 300)
  phase: Phase;
  log: GameLogEntry[];
  shuffleMode: ShuffleMode;
  /** Continuous shuffle intensity. 0 = light (current default, biased hands), 1 = full random. */
  shuffleIntensity: number;
  /** If true, intensity is re-rolled uniformly at random on every deal (initial deal + redeals + next-round). */
  randomizeShuffle?: boolean;
}

export interface GameLogEntry {
  id: number;
  text: string;
  kind: "info" | "bid" | "trick" | "score" | "reveal" | "system";
}

export const CARD_POINTS: Partial<Record<Rank, number>> = {
  14: 15, // Ace
  10: 10, // Ten
  5: 5,   // Five
  // Queen of spades handled specially: 30
};

export function cardPoints(card: Card): number {
  if (card.suit === "S" && card.rank === 12) return 30;
  return CARD_POINTS[card.rank] ?? 0;
}

// 2×30 + 8×15 + 8×10 + 8×5 = 300
export const TOTAL_POINTS_IN_DECK = 300;
export const MIN_BID = 150;
export const MAX_BID = 300;
export const BID_INCREMENT = 5;
