// Hand ordering that separates same-coloured suits with a different colour when
// possible. The two reds (♥ ♦) and two blacks (♠ ♣) are easy to confuse side by
// side, so we interleave colours: e.g. ♠ ♥ ♣ ♦ rather than ♠ ♣ ♥ ♦. When a hand
// only has one colour (or a colour is missing) we just keep the suits together.
import type { Card, Suit } from "./types";

const isRed = (s: Suit) => s === "H" || s === "D";

/** Order the present suits so adjacent suits alternate colour where possible.
 *  Trump (if present in hand) always comes first. */
export function suitOrder(present: Suit[], trump?: Suit): Suit[] {
  const has = new Set(present);
  // Stable within-colour order: ♠ before ♣, ♥ before ♦.
  const blacks = (["S", "C"] as Suit[]).filter((s) => has.has(s) && s !== trump);
  const reds = (["H", "D"] as Suit[]).filter((s) => has.has(s) && s !== trump);

  const out: Suit[] = [];
  let lastRed: boolean | null = null;
  if (trump && has.has(trump)) { out.push(trump); lastRed = isRed(trump); }

  while (blacks.length || reds.length) {
    // Prefer the colour opposite the last placed suit; fall back when one is empty.
    let takeRed: boolean;
    if (lastRed === null) takeRed = reds.length > blacks.length; // start with the larger group
    else takeRed = !lastRed;
    if (takeRed && reds.length === 0) takeRed = false;
    if (!takeRed && blacks.length === 0) takeRed = true;
    out.push((takeRed ? reds : blacks).shift()!);
    lastRed = takeRed;
  }
  return out;
}

/** Sort a hand by the colour-alternating suit order, then high-to-low rank. */
export function sortHandByColor(hand: Card[], trump?: Suit): Card[] {
  const order = suitOrder([...new Set(hand.map((c) => c.suit))], trump);
  const idx = (s: Suit) => order.indexOf(s);
  return hand.slice().sort((a, b) => idx(a.suit) - idx(b.suit) || b.rank - a.rank);
}
