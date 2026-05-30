// POST { gameId, aiPersonality?, shuffleIntensity? } → { ok }
// Host-only. Fills empty seats with AI, deals server-side, advances initial AI
// turns, and persists the authoritative + public + hand state.
import { corsHeaders, json, err } from "../_shared/cors.ts";
import { admin, getUserId } from "../_shared/supa.ts";
import { freshGame } from "../_shared/engine/engine.ts";
import { advance } from "../_shared/advance.ts";
import { saveState } from "../_shared/persist.ts";

const AI_NAMES = ["Seer", "Envoy", "Darwin", "Rulebook", "Greedy"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const uid = await getUserId(req);
  if (!uid) return err("Not signed in", 401);

  const { gameId, aiPersonality, shuffleIntensity } = await req.json().catch(() => ({}));
  const db = admin();

  const { data: game } = await db.from("bq_games")
    .select("id,host_user_id,status").eq("id", gameId).maybeSingle();
  if (!game) return err("Game not found", 404);
  if (game.host_user_id !== uid) return err("Only the host can start the game", 403);
  if (game.status !== "lobby") return err("Game already started", 409);

  const { data: players } = await db.from("bq_game_players")
    .select("seat,user_id,display_name,is_ai").eq("game_id", gameId);
  const bySeat = new Map((players ?? []).map((p) => [p.seat, p]));

  const pers = aiPersonality || "hard-4";
  const newAi: Record<string, unknown>[] = [];
  const configs: { name: string; isAI: boolean; aiPersonality?: string }[] = [];

  for (let seat = 0; seat < 5; seat++) {
    const p = bySeat.get(seat);
    if (p) {
      configs.push({ name: p.display_name, isAI: p.is_ai, aiPersonality: p.is_ai ? pers : undefined });
    } else {
      const name = AI_NAMES[seat % AI_NAMES.length];
      newAi.push({ game_id: gameId, seat, user_id: null, is_ai: true, ai_personality: pers, display_name: name });
      configs.push({ name, isAI: true, aiPersonality: pers });
    }
  }
  if (newAi.length) await db.from("bq_game_players").insert(newAi);

  // Deal (server RNG) + run any leading AI turns.
  const intensity = Math.max(0, Math.min(1, Number(shuffleIntensity ?? 0)));
  let state = freshGame(configs, 300, intensity >= 0.5 ? "full" : "light", intensity, false);
  state = advance(state);

  const seatUser: Record<number, string | null> = {};
  for (let seat = 0; seat < 5; seat++) seatUser[seat] = bySeat.get(seat)?.user_id ?? null;

  const status = state.phase === "game_end" ? "done" : "playing";
  await saveState(db, gameId, state, seatUser, status, 1);

  return json({ ok: true });
});
