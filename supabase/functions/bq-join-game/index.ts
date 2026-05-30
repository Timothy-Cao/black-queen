// POST { roomCode, displayName } → { gameId, seat }
// Joins a lobby by code, taking the next free seat.
import { corsHeaders, json, err } from "../_shared/cors.ts";
import { admin, getUserId } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const uid = await getUserId(req);
  if (!uid) return err("Not signed in", 401);

  const { roomCode, gameId, displayName } = await req.json().catch(() => ({}));
  if (!roomCode && !gameId) return err("Missing room code");
  const db = admin();

  // Resolve by id (admin room browser) or by room code (normal join).
  const query = db.from("bq_games").select("id,status");
  const { data: game } = await (gameId
    ? query.eq("id", gameId).maybeSingle()
    : query.eq("room_code", String(roomCode).toUpperCase()).maybeSingle());
  if (!game) return err("No game with that code", 404);
  if (game.status !== "lobby") return err("That game has already started", 409);

  const { data: players } = await db.from("bq_game_players")
    .select("seat,user_id,display_name").eq("game_id", game.id);

  const mine = (players ?? []).find((p) => p.user_id === uid);
  if (mine) return json({ gameId: game.id, seat: mine.seat }); // already in

  const taken = new Set((players ?? []).map((p) => p.seat));
  let seat = -1;
  for (let s = 0; s < 5; s++) if (!taken.has(s)) { seat = s; break; }
  if (seat < 0) return err("That game is full", 409);

  // Disambiguate duplicate display names within the room ("Tim" → "Tim 2").
  const usedNames = new Set((players ?? []).map((p) => p.display_name));
  let name = String(displayName || "Player").slice(0, 24);
  if (usedNames.has(name)) { let i = 2; while (usedNames.has(`${name} ${i}`)) i++; name = `${name} ${i}`; }

  await db.from("bq_game_players").insert({
    game_id: game.id, seat, user_id: uid, is_ai: false, display_name: name,
  });

  return json({ gameId: game.id, seat });
});
