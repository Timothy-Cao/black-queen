// Translates between the live engine GameState and its DB representations.
//
//   secrets  = full authoritative state (server-only)   — serializeState
//   public   = redacted projection for clients           — publicProjection
//   hands    = per-seat current hand for bq_hands         — handsRows
//
// The only JSON-unsafe field is `round.passed` (a Set); we store it as an array
// everywhere and rebuild the Set when loading the authoritative state.

import type { GameState, RoundState, PlayerId } from "./engine/types.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

function passedToArray(r: RoundState): Any {
  return { ...r, passed: Array.from(r.passed ?? new Set()) };
}
function passedToSet(r: Any): RoundState {
  return { ...r, passed: new Set<PlayerId>(r.passed ?? []) } as RoundState;
}

/** Full state → JSON-safe (Set→array). Stored in bq_game_secrets.state. */
export function serializeState(s: GameState): Any {
  return {
    ...s,
    round: passedToArray(s.round),
    history: (s.history ?? []).map(passedToArray),
  };
}

/** bq_game_secrets.state JSON → live GameState (array→Set). */
export function deserializeState(j: Any): GameState {
  return {
    ...j,
    round: passedToSet(j.round),
    history: (j.history ?? []).map(passedToSet),
  } as GameState;
}

/** Client-safe projection: strips every hand and the hidden partner list. */
export function publicProjection(s: GameState): Any {
  // Once the game is over the partner list is no longer secret — reveal it so the
  // client can show the full caller team + correct captured total on the results
  // screen. (During play, partners stay hidden except via round.revealedPartners.)
  const gameOver = s.phase === "round_end" || s.phase === "game_end";
  const redact = (r: RoundState, reveal: boolean): Any => ({
    ...passedToArray(r),
    hands: {},                              // initial deal — secret
    partners: reveal ? r.partners : undefined, // hidden until the game ends
  });
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, hand: [] })),
    round: redact(s.round, gameOver),
    history: (s.history ?? []).map((r) => redact(r, true)), // finished rounds
  };
}

/** Per-seat hand rows for bq_hands. `seatUser` maps seat → user_id (null = AI). */
export function handsRows(s: GameState, seatUser: Record<number, string | null>) {
  return s.players.map((p) => ({
    seat: p.id as number,
    user_id: seatUser[p.id] ?? null,
    cards: p.hand,
  }));
}
