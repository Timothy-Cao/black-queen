// POST { displayName } → { gameId, roomCode, seat }
// Creates a lobby (host = seat 0). Enforces the max-3-concurrent-games cap.
import { corsHeaders, json, err } from "../_shared/cors.ts";
import { admin, getUserId } from "../_shared/supa.ts";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
const code = (n = 4) =>
  Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const uid = await getUserId(req);
  if (!uid) return err("Not signed in", 401);

  const { displayName } = await req.json().catch(() => ({}));
  const db = admin();

  // --- Self-healing cleanup so abandoned rooms can't permanently fill the cap ---
  // 1. Time-based: any game with no activity (bq_games.updated_at, bumped on every
  //    move) for 30+ minutes is a ghost (abandoned lobby or stalled game). Cascade
  //    deletes players/hands/secrets/moves.
  const STALE_CUTOFF = new Date(Date.now() - 30 * 60_000).toISOString();
  await db.from("bq_games").delete().lt("updated_at", STALE_CUTOFF);

  // 2. Caller-owned lobbies: a user clicking "Create room" intends a fresh lobby,
  //    so drop any lobby they're still sitting in (e.g. a previous create where the
  //    tab closed before leaveGame fired). Delete the room if no humans remain.
  const { data: myRows } = await db.from("bq_game_players").select("game_id").eq("user_id", uid);
  const myGameIds = [...new Set((myRows ?? []).map((r) => r.game_id))];
  if (myGameIds.length) {
    const { data: myGames } = await db.from("bq_games").select("id,status").in("id", myGameIds);
    for (const g of (myGames ?? []).filter((x) => x.status === "lobby")) {
      await db.from("bq_game_players").delete().eq("game_id", g.id).eq("user_id", uid);
      const { data: rem } = await db.from("bq_game_players").select("user_id").eq("game_id", g.id);
      if (!(rem ?? []).some((p) => p.user_id)) await db.from("bq_games").delete().eq("id", g.id);
    }
  }

  // Cap: at most 3 active games at once.
  const { count } = await db.from("bq_games")
    .select("id", { count: "exact", head: true })
    .in("status", ["lobby", "playing"]);
  if ((count ?? 0) >= 3) {
    return err("All multiplayer tables are full right now. Try again soon.", 429);
  }

  // Unique room code.
  let rc = code();
  for (let i = 0; i < 6; i++) {
    const { data } = await db.from("bq_games").select("id").eq("room_code", rc).maybeSingle();
    if (!data) break;
    rc = code();
  }

  const { data: game, error } = await db.from("bq_games")
    .insert({ room_code: rc, host_user_id: uid, status: "lobby", public_state: {} })
    .select("id").single();
  if (error || !game) return err("Could not create game", 500);

  await db.from("bq_game_players").insert({
    game_id: game.id, seat: 0, user_id: uid, is_ai: false,
    display_name: String(displayName || "Host").slice(0, 24),
  });

  return json({ gameId: game.id, roomCode: rc, seat: 0 });
});
