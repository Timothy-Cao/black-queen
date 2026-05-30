// POST { gameId } → { ok }
// Leaving a lobby frees the seat. Leaving a game in progress hands the seat to
// AI so play continues. Either way, if no humans remain the game is destroyed.
import { corsHeaders, json, err } from "../_shared/cors.ts";
import { admin, getUserId } from "../_shared/supa.ts";
import { deserializeState } from "../_shared/codec.ts";
import { advance } from "../_shared/advance.ts";
import { saveState, seatUserMap } from "../_shared/persist.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const uid = await getUserId(req);
  if (!uid) return err("Not signed in", 401);

  const { gameId } = await req.json().catch(() => ({}));
  const db = admin();

  const { data: game } = await db.from("bq_games")
    .select("id,status").eq("id", gameId).maybeSingle();
  if (!game) return json({ ok: true }); // already gone

  const { data: me } = await db.from("bq_game_players")
    .select("seat").eq("game_id", gameId).eq("user_id", uid).maybeSingle();
  if (!me) return json({ ok: true });
  const seat = me.seat as number;

  if (game.status === "lobby") {
    await db.from("bq_game_players").delete().eq("game_id", gameId).eq("seat", seat);
  } else {
    // In progress → AI takes over the seat.
    await db.from("bq_game_players")
      .update({ is_ai: true, user_id: null, display_name: "AI" })
      .eq("game_id", gameId).eq("seat", seat);

    const { data: secret } = await db.from("bq_game_secrets")
      .select("state").eq("game_id", gameId).maybeSingle();
    if (secret) {
      let state = deserializeState(secret.state);
      state.players[seat].isAI = true;
      state = advance(state); // in case it was their turn
      const seatUser = await seatUserMap(db, gameId);
      const { data: g2 } = await db.from("bq_games").select("version").eq("id", gameId).maybeSingle();
      const status = state.phase === "game_end" ? "done" : "playing";
      await saveState(db, gameId, state, seatUser, status, (g2?.version ?? 0) + 1);
    }
  }

  // Humanless game → destroy it (cascades to players, hands, secrets, moves).
  const { data: remaining } = await db.from("bq_game_players")
    .select("user_id").eq("game_id", gameId);
  const humans = (remaining ?? []).filter((p) => p.user_id);
  if (humans.length === 0) {
    await db.from("bq_games").delete().eq("id", gameId);
  }

  return json({ ok: true });
});
