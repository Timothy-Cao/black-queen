import { Card, PlayerId, Suit, Trick, TrickCard, cardPoints } from "./types";

export function legalPlays(hand: Card[], trick: Trick | undefined): Card[] {
  if (!trick || trick.plays.length === 0) return hand.slice();
  const led = trick.plays[0].card.suit;
  const followers = hand.filter((c) => c.suit === led);
  return followers.length > 0 ? followers : hand.slice();
}

export function isLegalPlay(card: Card, hand: Card[], trick: Trick | undefined): boolean {
  return legalPlays(hand, trick).some((c) => c.id === card.id);
}

export function trickWinner(trick: Trick, trump: Suit | undefined): PlayerId {
  if (trick.plays.length === 0) throw new Error("Empty trick");
  const led = trick.plays[0].card.suit;
  let best: TrickCard = trick.plays[0];
  for (const p of trick.plays.slice(1)) {
    const bestIsTrump = trump && best.card.suit === trump;
    const playIsTrump = trump && p.card.suit === trump;
    if (playIsTrump && !bestIsTrump) {
      best = p;
    } else if (playIsTrump && bestIsTrump) {
      if (p.card.rank > best.card.rank) best = p;
    } else if (!playIsTrump && !bestIsTrump) {
      if (p.card.suit === led && p.card.rank > best.card.rank) best = p;
    }
    // else play is non-trump while best is trump -> best stays
  }
  return best.player;
}

export function trickPoints(trick: Trick): number {
  return trick.plays.reduce((s, p) => s + cardPoints(p.card), 0);
}

export function nextPlayer(p: PlayerId): PlayerId {
  return ((p + 1) % 5) as PlayerId;
}
