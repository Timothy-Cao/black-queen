// Minimal server-side AI for filled seats (v1).
//
// v1 keeps this trivial just to validate the full online loop: AI seats PASS in
// bidding (so humans drive the contract), play a random legal card, and only
// declare defensively (rare, since they never win the bid). Upgrade path:
// vendor aiHard.ts (Hard-3) or call the Rust/WASM Hard-4 here.

import type { GameState, PlayerId, Card, Suit } from "./engine/types.ts";
import {
  applyPass, applyDeclare, applyPlay, bidderCopiesOf, totalCopiesOf,
} from "./engine/engine.ts";
import { legalPlays } from "./engine/rules.ts";

const SUITS: Suit[] = ["S", "H", "D", "C"];
const RANKS = [14, 13, 12, 11, 10, 9, 8, 7, 5];

export function aiMove(state: GameState, seat: PlayerId): GameState {
  const r = state.round;

  if (r.phase === "bidding" && r.bidTurn === seat) {
    return applyPass(state, seat); // v1: AI never bids
  }

  if (r.phase === "declaring" && r.bidder === seat) {
    const hand = state.players[seat].hand;
    const counts: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
    for (const c of hand) counts[c.suit]++;
    const trump = SUITS.reduce((a, b) => (counts[b] > counts[a] ? b : a), "S" as Suit);
    // Highest-value card the bidder does NOT own every copy of = a legal call.
    let partner: Card | null = null;
    outer: for (const rank of RANKS) {
      for (const s of SUITS) {
        if (bidderCopiesOf(state, s, rank) < totalCopiesOf(s, rank)) {
          partner = { suit: s, rank: rank as Card["rank"], id: `${s}${rank}` };
          break outer;
        }
      }
    }
    if (!partner) partner = { suit: "H", rank: 14 as Card["rank"], id: "H14" };
    return applyDeclare(state, trump, partner);
  }

  if (r.phase === "playing" && r.toPlay === seat) {
    const legal = legalPlays(state.players[seat].hand, r.currentTrick);
    const card = legal[Math.floor(Math.random() * legal.length)];
    return applyPlay(state, seat, card);
  }

  return state;
}
