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
