// POST {} → { rooms } — ADMIN ONLY. Lists every room with a summary so an admin
// can browse, join, or delete any of them.
import { corsHeaders, json, err } from "../_shared/cors.ts";
import { admin, getUser, isAdmin } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await getUser(req);
  if (!caller) return err("Not signed in", 401);
  if (!isAdmin(caller.email)) return err("Admins only", 403);

  const db = admin();
  const { data: games } = await db.from("bq_games")
    .select("id,room_code,status,created_at")
    .order("created_at", { ascending: false });

  const ids = (games ?? []).map((g) => g.id);
  const counts: Record<string, { humans: number; total: number }> = {};
  for (const id of ids) counts[id] = { humans: 0, total: 0 };
  if (ids.length) {
    const { data: players } = await db.from("bq_game_players")
      .select("game_id,user_id").in("game_id", ids);
    for (const p of players ?? []) {
      counts[p.game_id].total++;
      if (p.user_id) counts[p.game_id].humans++;
    }
  }

  const rooms = (games ?? []).map((g) => ({
    id: g.id, roomCode: g.room_code, status: g.status,
    humans: counts[g.id].humans, total: counts[g.id].total,
  }));
  return json({ rooms });
});
