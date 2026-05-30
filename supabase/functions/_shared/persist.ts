// Write the authoritative state to all three representations atomically-ish:
//   bq_game_secrets.state  — full (server-only)
//   bq_games.public_state  — redacted (clients)
//   bq_hands               — per-seat current hand (RLS-delivered)
// plus status + version on bq_games.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { GameState } from "./engine/types.ts";
import { serializeState, publicProjection, handsRows } from "./codec.ts";

export type GameStatus = "lobby" | "playing" | "done";

/** seatUser: seat → user_id (null for AI seats). */
export async function saveState(
  db: SupabaseClient,
  gameId: string,
  state: GameState,
  seatUser: Record<number, string | null>,
  status: GameStatus,
  version: number,
): Promise<void> {
  await db.from("bq_game_secrets").upsert({
    game_id: gameId,
    state: serializeState(state),
    updated_at: new Date().toISOString(),
  });
  await db.from("bq_games").update({
    public_state: publicProjection(state),
    status,
    version,
  }).eq("id", gameId);
  const rows = handsRows(state, seatUser).map((h) => ({ game_id: gameId, ...h }));
  await db.from("bq_hands").upsert(rows);
}

/** Load seat → user_id map from bq_game_players. */
export async function seatUserMap(
  db: SupabaseClient,
  gameId: string,
): Promise<Record<number, string | null>> {
  const { data } = await db.from("bq_game_players")
    .select("seat,user_id").eq("game_id", gameId);
  const m: Record<number, string | null> = {};
  for (const row of data ?? []) m[row.seat] = row.user_id;
  return m;
}
