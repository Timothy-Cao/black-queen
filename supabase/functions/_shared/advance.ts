// Drive the game forward through AI seats and completed tricks until it's a
// human's turn or the game ends. Called after every human action and at game
// start. Bounded against infinite loops.

import type { GameState, PlayerId } from "./engine/types.ts";
import { collectTrick } from "./engine/engine.ts";
import { aiMove } from "./serverai.ts";

export function advance(state: GameState): GameState {
  let s = state;
  for (let i = 0; i < 300; i++) {
    if (s.phase === "game_end" || s.phase === "round_end") break;
    const r = s.round;
    // v1: auto-collect a completed trick immediately. (Later: add a brief
    // server-side reveal delay so clients can see the full trick first.)
    if (r.pendingTrickComplete) { s = collectTrick(s); continue; }

    let actor: PlayerId | undefined;
    if (r.phase === "bidding") actor = r.bidTurn;
    else if (r.phase === "declaring") actor = r.bidder;
    else if (r.phase === "playing") actor = r.toPlay;

    if (actor === undefined) break;
    if (!s.players[actor].isAI) break; // hand back to a human
    s = aiMove(s, actor);
  }
  return s;
}
