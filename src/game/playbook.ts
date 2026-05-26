// Strategy playbook — formalizes hand evaluation, bidding, partner-card choice,
// reading the table, team play, and leads. Used by the in-game help screen, the
// random tip overlay, and as the basis for AI heuristics in ai.ts.

export type TipCategory =
  | "hand"
  | "bidding"
  | "partner-call"
  | "deduction"
  | "team-play"
  | "leads"
  | "meta";

export interface Tip {
  id: number;
  category: TipCategory;
  title: string;
  body: string;
}

export const PLAYBOOK: Tip[] = [
  // Hand evaluation
  { id: 1, category: "hand", title: "Long suits are bidder's gold",
    body: "If a single suit fills 7+ of your 13 cards, you have a natural trump candidate. Declare that suit and most of the trump cards live in your hand." },
  { id: 2, category: "hand", title: "Voids are weapons",
    body: "A suit you have 0–1 cards in is great news: the moment someone leads it you can ruff with trump. Long trump + a side void shreds opponents." },
  { id: 3, category: "hand", title: "Aces > Kings > Queens",
    body: "Aces are worth 15 points and top their suit. Kings only matter if your team already controls the Ace. Q♠ is uniquely huge — 30 points and a magnet for partner calls." },
  { id: 4, category: "hand", title: "Top control",
    body: "Both Aces + both Kings of one suit means four guaranteed tricks of that suit. Doubly devastating if it's also your trump." },
  { id: 5, category: "hand", title: "Trump density + side void",
    body: "Long trump and a side suit you're void in is the dream combo — you cut every time that suit is led and dominate the rest with your trumps." },

  // Bidding strategy
  { id: 6, category: "bidding", title: "Don't bid yourself into a corner",
    body: "Your bid should be ≤ your projected captures + ~30–50 pts for partner help. Bidding 250 with no Aces is suicide." },
  { id: 7, category: "bidding", title: "Obvious partner cards: hold back",
    body: "If your hand is loaded with Aces and Q♠, someone is going to call you anyway. Let the bid go to someone who needs you — you'll still get the payout if their team makes the bid." },
  { id: 8, category: "bidding", title: "Fight for the bid when stuck",
    body: "With a mediocre hand and no obvious 'I'll be called' cards, sometimes you must bid just to keep agency. Even a risky 150 bid is better than playing blind defense." },
  { id: 9, category: "bidding", title: "300 is total points — not a target",
    body: "The deck has exactly 300 pts. Opponents only need 300 − bid + 1 to defeat the bid. A 200 bid means the bidder team has to capture 200 out of 300 — tight margins." },

  // Partner card selection
  { id: 10, category: "partner-call", title: "Default: Ace of your strong side suit",
    body: "Calling the Ace of a long side suit lets your partner protect that suit. They'll likely lead it back to you after you ruff out trumps." },
  { id: 11, category: "partner-call", title: "Q♠ as bait",
    body: "If you don't hold Q♠, calling it gives your hidden partner a 30-point swing they can drop on a winning teammate trick. Devastating when it lands." },
  { id: 12, category: "partner-call", title: "Don't call a card you hold (unless forced)",
    body: "If you hold one copy of your call, your partner is identifiable by who plays the other copy. Calling a card you don't own at all keeps the deception alive longer." },

  // Reading the table
  { id: 13, category: "deduction", title: "Voids reveal hands",
    body: "Anyone who can't follow a led suit is void in that suit. Note it — every void narrows the possible holders of the partner card." },
  { id: 14, category: "deduction", title: "Smear ≈ partner",
    body: "An opponent who feeds 15-point cards to the bidder's winning trick is almost certainly the partner. Real opponents spread their points." },
  { id: 15, category: "deduction", title: "Refusal to ruff",
    body: "A player who passes up an obvious trump opportunity is hiding their hand — usually because they don't want to tip their team yet." },

  // Team play
  { id: 16, category: "team-play", title: "Smear to your partner",
    body: "If you're partnered (called card matches your hand, or you know your team), throw point cards (A, 10, 5, Q♠) onto your teammate's winning trick. Every concentrated point counts." },
  { id: 17, category: "team-play", title: "Opponents spread",
    body: "If you're against the bidder, never concentrate points on a single bidder-team trick. Spread your 5s and 10s so the bid stays just out of reach." },
  { id: 18, category: "team-play", title: "Defensive dump",
    body: "If the bidder's team is winning a trick and you can't beat it, dump worthless cards (8s, 9s, low non-trump). Save your high cards for when they matter." },

  // Leads
  { id: 19, category: "leads", title: "Bidder team: lead high trump",
    body: "On the lead, drive out opponents' trumps before they ruff your point tricks. Trump density is wasted if you let opponents trump your Aces." },
  { id: 20, category: "leads", title: "Opponents: lead away from trump",
    body: "Lead suits where the bidder is likely void or short. Aces of side suits you hold are perfect — force the bidder to discard or ruff early." },
  { id: 21, category: "leads", title: "Don't lead the partner card",
    body: "If you're holding the called card, let it come to you. Leading it announces your team prematurely." },

  // Meta (about the game itself)
  { id: 22, category: "meta", title: "Light vs full shuffle",
    body: "Full shuffle gives uniform 4/3/3/3 hands. Light shuffle biases each hand toward a dominant suit (~7–9 cards) — more dramatic bidding and louder voids." },
  { id: 23, category: "meta", title: "Read the bidder",
    body: "A bidder who jumped straight to 200+ usually has a strong long suit. A cautious 150 bidder may be fishing for a strong partner card to carry them." },
  { id: 24, category: "meta", title: "Watch the called card",
    body: "Two copies exist. Once one is played, only one partner remains hidden. After both copies appear, every revealed clue becomes harder to fake." },
];

/** Pick a tip not equal to lastId (when possible). */
export function randomTip(lastId?: number): Tip {
  const pool = lastId !== undefined ? PLAYBOOK.filter((t) => t.id !== lastId) : PLAYBOOK;
  return pool[Math.floor(Math.random() * pool.length)];
}

export const CATEGORY_LABEL: Record<TipCategory, string> = {
  hand: "Hand evaluation",
  bidding: "Bidding",
  "partner-call": "Calling a partner",
  deduction: "Reading the table",
  "team-play": "Team play",
  leads: "Leads",
  meta: "The game itself",
};
