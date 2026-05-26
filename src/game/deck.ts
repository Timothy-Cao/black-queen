import { Card, Rank, Suit, SUITS } from "./types";

// 5-player Black Queen deck (project-specific variant):
//   • 2 copies of every: 5, 8, 9, 10, J, Q, K, A in all 4 suits  -> 2 × 8 × 4 = 64 cards
//   • 1 copy of 7♠ (the only 7 in the deck)                       -> +1
//   = 65 cards total, dealt 13 per player.
//
// Point cards: A=15, 10=10, 5=5, Q♠=30. With 2 decks that's
//   2×30 + 8×15 + 8×10 + 8×5 = 60+120+80+40 = 300 total points.

const KEPT_RANKS: Rank[] = [5, 7, 8, 9, 10, 11, 12, 13, 14];

export function buildDeck5p(): Card[] {
  const deck: Card[] = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const suit of SUITS) {
      for (const rank of KEPT_RANKS) {
        if (rank === 7) continue; // 7s handled specially below
        deck.push({ suit, rank, id: `${suit}${rank}_${copy}` });
      }
    }
  }
  // Single 7♠
  deck.push({ suit: "S", rank: 7, id: "S7_0" });
  if (deck.length !== 65) throw new Error(`Expected 65 cards, got ${deck.length}`);
  return deck;
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function deal5p(deck: Card[]): Card[][] {
  if (deck.length !== 65) throw new Error("Deck must be 65 cards");
  const hands: Card[][] = [[], [], [], [], []];
  for (let i = 0; i < 65; i++) hands[i % 5].push(deck[i]);
  for (const h of hands) h.sort(handSort);
  return hands;
}

/**
 * "Light shuffle" deal: biases each hand toward a dominant suit (~7–9 cards) plus
 * a near-void in another suit. Produces more dramatic bids and louder voids
 * than a fully-random shuffle, which tends to give boring 4/3/3/3 hands.
 *
 * Algorithm: assign each player a dominant + a weak suit (rotated randomly so
 * all 4 suits are favored by at least one of the 5 players). Then walk the
 * shuffled deck and assign each card to a player by weighted random (5× weight
 * on dominant, 0.4× on weak, 1× on neutral, 0 if hand already full).
 */
export function deal5pLight(deck: Card[]): Card[][] {
  if (deck.length !== 65) throw new Error("Deck must be 65 cards");
  const suits: Suit[] = ["S", "H", "D", "C"];
  const shuffledSuits = shuffle(suits);
  // Five favored suits (one suit doubled), assigned to players in a random order.
  const dominantList: Suit[] = [shuffledSuits[0], shuffledSuits[1], shuffledSuits[2], shuffledSuits[3], shuffledSuits[Math.floor(Math.random() * 4)]];
  const playerOrder = shuffle([0, 1, 2, 3, 4]);
  const playerDominant: Record<number, Suit> = {};
  const playerWeak: Record<number, Suit> = {};
  for (let i = 0; i < 5; i++) {
    const p = playerOrder[i];
    playerDominant[p] = dominantList[i];
    const others = suits.filter((s) => s !== playerDominant[p]);
    playerWeak[p] = others[Math.floor(Math.random() * others.length)];
  }

  const hands: Card[][] = [[], [], [], [], []];
  for (const card of deck) {
    const weights: number[] = [];
    let total = 0;
    for (let i = 0; i < 5; i++) {
      let w: number;
      if (hands[i].length >= 13) w = 0;
      else if (card.suit === playerDominant[i]) w = 5;
      else if (card.suit === playerWeak[i]) w = 0.4;
      else w = 1;
      weights.push(w);
      total += w;
    }
    let r = Math.random() * total;
    let chosen = 4;
    for (let i = 0; i < 5; i++) {
      r -= weights[i];
      if (r <= 0) { chosen = i; break; }
    }
    hands[chosen].push(card);
  }
  // Sanity: any hand under 13 cards (shouldn't happen if weights sum > 0, but be safe)
  for (let i = 0; i < 5; i++) {
    if (hands[i].length !== 13) {
      // Fallback: re-balance by moving from largest hand
      while (hands[i].length < 13) {
        const biggest = hands.reduce((acc, h, idx) => h.length > acc.len ? { idx, len: h.length } : acc, { idx: 0, len: 0 });
        hands[i].push(hands[biggest.idx].pop()!);
      }
      while (hands[i].length > 13) {
        const smallest = hands.reduce((acc, h, idx) => (idx !== i && h.length < acc.len) ? { idx, len: h.length } : acc, { idx: -1, len: 14 });
        if (smallest.idx < 0) break;
        hands[smallest.idx].push(hands[i].pop()!);
      }
    }
  }
  for (const h of hands) h.sort(handSort);
  return hands;
}

export function handSort(a: Card, b: Card): number {
  const order: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 };
  if (a.suit !== b.suit) return order[a.suit] - order[b.suit];
  return b.rank - a.rank;
}
