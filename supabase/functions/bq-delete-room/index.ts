// POST { gameId } → { ok } — ADMIN ONLY. Deletes any room (cascades to players,
// hands, secrets, moves).
import { corsHeaders, json, err } from "../_shared/cors.ts";
import { admin, getUser, isAdmin } from "../_shared/supa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await getUser(req);
  if (!caller) return err("Not signed in", 401);
  if (!isAdmin(caller.email)) return err("Admins only", 403);

  const { gameId } = await req.json().catch(() => ({}));
  if (!gameId) return err("Missing gameId");

  const db = admin();
  await db.from("bq_games").delete().eq("id", gameId);
  return json({ ok: true });
});
