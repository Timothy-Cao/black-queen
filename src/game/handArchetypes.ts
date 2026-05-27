// =============================================================================
//  Hand archetype scores.
//
//  Three orthogonal axes that classify what *kind* of hand you hold — useful
//  for strategic reasoning and for any future opponent-modeling feature.
//  These are not consumed by the production AI today; they're a vocabulary
//  for analysis and an entry point for future feature engineering.
//
//  See `AI.md` and the AI Info page's "Hand archetypes" section for the
//  strategic interpretation.
// =============================================================================

import { Card, cardPoints } from "./types";

// ---------------------------------------------------------------------------
//  PARTNER score — coverage of common partner-call targets.
//
//  How many unique partner-eligible cards do I hold ≥1 of? Aces in each of
//  the four suits + Q♠. Range: 0–5.
//
//  Semantic:
//    0–1   "Locked into opposing team" — almost certainly going to be opponent
//    2–3   "Probably partner" — caller's most likely picks include something
//          you hold
//    4–5   "Definitely partner" — whatever the caller picks, you've got it
// ---------------------------------------------------------------------------

export function partnerScore(hand: Card[]): number {
  const have = (suit: string, rank: number) =>
    hand.some((c) => c.suit === suit && c.rank === rank);
  let s = 0;
  if (have("S", 14)) s++;   // A♠
  if (have("H", 14)) s++;   // A♥
  if (have("D", 14)) s++;   // A♦
  if (have("C", 14)) s++;   // A♣
  if (have("S", 12)) s++;   // Q♠
  return s;
}

// ---------------------------------------------------------------------------
//  FEEDER score — expected points your hand will give away.
//
//  Non-ace point cards (10s, 5s, Q♠) contribute their full value: they are
//  "donation-ready" — easily captured by anyone with a higher card or trump.
//  Aces are discounted to 50% because they win their own points roughly half
//  the time (they lose to trump and to second copies in long suits).
//
//  Typical range: 20–60 for an average hand; 90+ for a hand stuffed with
//  unprotected mid-rank point cards.
//
//  Semantic:
//    Low  — you have little to lose; safe to play conservatively
//    High — you'll be bleeding points regardless of role. Catastrophic on the
//           opposing team; an asset for the caller team (smear-rich)
// ---------------------------------------------------------------------------

export function feederScore(hand: Card[]): number {
  let s = 0;
  for (const c of hand) {
    const pts = cardPoints(c);
    if (pts === 0) continue;
    if (c.rank === 14) s += pts * 0.5;
    else s += pts;
  }
  return Math.round(s * 10) / 10;
}

// ---------------------------------------------------------------------------
//  CALLER score — strength as the bid winner.
//
//  A strong caller needs: a long trump suit (control of trump-led tricks),
//  voids in other suits (so they can cut), and top cards in trump (A / K).
//
//  Formula: (longest_suit_length)² + 4 × voids + 2 × (A/K count in longest suit)
//
//  Squared length emphasizes that a 7-card suit is exponentially more valuable
//  than a 5-card suit, not linearly. Voids are weighted because they're the
//  difference between cutting and feeding.
//
//  Typical range: 30–80 for an average hand; 120+ for a strong-caller hand.
//
//  Semantic:
//    Low  — no clear trump candidate; you'd be a weak caller
//    High — if your longest suit becomes trump you'd dominate
// ---------------------------------------------------------------------------

export function callerScore(hand: Card[]): {
  score: number;
  longestSuit: string;
  longestSuitLength: number;
  voidCount: number;
} {
  const suits = ["S", "H", "D", "C"] as const;
  const lengths: Record<string, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const c of hand) lengths[c.suit]++;

  let longestSuit: string = "S";
  let longestLen = 0;
  for (const s of suits) {
    if (lengths[s] > longestLen) {
      longestLen = lengths[s];
      longestSuit = s;
    }
  }

  const voidCount = suits.filter((s) => lengths[s] === 0).length;

  const topInLongest = hand.filter(
    (c) => c.suit === longestSuit && (c.rank === 14 || c.rank === 13),
  ).length;

  const score = longestLen * longestLen + 4 * voidCount + 2 * topInLongest;
  return { score, longestSuit, longestSuitLength: longestLen, voidCount };
}

// ---------------------------------------------------------------------------
//  Combined classification.
//
//  Returns a coarse archetype label for the hand based on the three scores.
//  Useful for UI display or strategic logs.
// ---------------------------------------------------------------------------

export interface HandArchetype {
  partner: number;
  feeder: number;
  caller: { score: number; longestSuit: string; longestSuitLength: number; voidCount: number };
  /** Coarse label summarizing the hand's strategic role. */
  label: string;
}

export function classifyHand(hand: Card[]): HandArchetype {
  const p = partnerScore(hand);
  const f = feederScore(hand);
  const c = callerScore(hand);

  // Coarse labeling rules — picked for clarity, not exhaustive coverage.
  let label: string;
  if (c.score >= 90 && p >= 2) label = "Strong caller, partner-rich";
  else if (c.score >= 90)       label = "Strong caller";
  else if (p >= 4)              label = "Partner-magnet";
  else if (p >= 3 && c.score < 60) label = "Likely partner";
  else if (f >= 70 && p <= 1)   label = "High-feeder, opposing-side";
  else if (p <= 1 && c.score < 50) label = "Weak opposing-side";
  else                          label = "Balanced";

  return { partner: p, feeder: f, caller: c, label };
}
