// POST { gameId, action } → { ok, version }
// action = { type: "bid", amount } | { type: "pass" }
//        | { type: "declare", trump, partnerCard } | { type: "play", card }
//
// Loads the authoritative state, validates that it's the caller's turn and the
// move is legal, applies it via the reducer, runs AI seats + trick collection,
// then persists everything.
import { corsHeaders, json, err } from "../_shared/cors.ts";
import { admin, getUserId } from "../_shared/supa.ts";
import type { PlayerId } from "../_shared/engine/types.ts";
import {
  applyBid, applyPass, applyDeclare, applyPlay, legalBidAmount,
} from "../_shared/engine/engine.ts";
import { legalPlays } from "../_shared/engine/rules.ts";
import { deserializeState } from "../_shared/codec.ts";
import { advance } from "../_shared/advance.ts";
import { saveState, seatUserMap } from "../_shared/persist.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const uid = await getUserId(req);
  if (!uid) return err("Not signed in", 401);

  const { gameId, action } = await req.json().catch(() => ({}));
  if (!gameId || !action?.type) return err("Missing gameId/action");
  const db = admin();

  const { data: game } = await db.from("bq_games")
    .select("id,status,version").eq("id", gameId).maybeSingle();
  if (!game) return err("Game not found", 404);
  if (game.status !== "playing") return err("Game is not in progress", 409);

  const { data: gp } = await db.from("bq_game_players")
    .select("seat").eq("game_id", gameId).eq("user_id", uid).maybeSingle();
  if (!gp) return err("You are not in this game", 403);
  const seat = gp.seat as PlayerId;

  const { data: secret } = await db.from("bq_game_secrets")
    .select("state").eq("game_id", gameId).maybeSingle();
  if (!secret) return err("State missing", 500);
  let state = deserializeState(secret.state);
  const r = state.round;

  try {
    switch (action.type) {
      case "bid": {
        if (r.phase !== "bidding" || r.bidTurn !== seat) return err("Not your turn to bid");
        const { min, max } = legalBidAmount(r);
        const amt = Number(action.amount);
        if (!(amt >= min && amt <= max)) return err("Illegal bid amount");
        state = applyBid(state, seat, amt);
        break;
      }
      case "pass": {
        if (r.phase !== "bidding" || r.bidTurn !== seat) return err("Not your turn to bid");
        state = applyPass(state, seat);
        break;
      }
      case "declare": {
        if (r.phase !== "declaring" || r.bidder !== seat) return err("Not your turn to declare");
        state = applyDeclare(state, action.trump, action.partnerCard);
        break;
      }
      case "play": {
        if (r.phase !== "playing" || r.toPlay !== seat || r.pendingTrickComplete) {
          return err("Not your turn to play");
        }
        const legal = legalPlays(state.players[seat].hand, r.currentTrick);
        const card = legal.find((c) =>
          c.id === action.card?.id ||
          (c.suit === action.card?.suit && c.rank === action.card?.rank));
        if (!card) return err("Illegal card");
        state = applyPlay(state, seat, card);
        break;
      }
      default:
        return err("Unknown action");
    }
  } catch (e) {
    return err("Move rejected: " + ((e as Error)?.message ?? "invalid"));
  }

  state = advance(state);

  const seatUser = await seatUserMap(db, gameId);
  const version = (game.version ?? 0) + 1;
  const status = state.phase === "game_end" ? "done" : "playing";
  await saveState(db, gameId, state, seatUser, status, version);

  await db.from("bq_moves").insert({
    game_id: gameId, seat, type: action.type, payload: action, version,
  });

  return json({ ok: true, version });
});
