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
  applyBid, applyPass, applyDeclare, applyPlay, legalBidAmount, collectTrick,
} from "../_shared/engine/engine.ts";
import { legalPlays } from "../_shared/engine/rules.ts";
import { deserializeState } from "../_shared/codec.ts";
import { aiMove } from "../_shared/serverai.ts";
import { saveState, seatUserMap } from "../_shared/persist.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const AI_DELAY_MS = 850;     // "thinking" pause before each AI action
const TRICK_PAUSE_MS = 1300; // hold a completed trick before sweeping it

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

  const seatUser = await seatUserMap(db, gameId);
  const statusOf = (s: typeof state) => (s.phase === "game_end" ? "done" : "playing");
  let version = (game.version ?? 0) + 1;

  // 1) Persist the human's move immediately (no delay on your own action).
  await saveState(db, gameId, state, seatUser, statusOf(state), version);
  await db.from("bq_moves").insert({ game_id: gameId, seat, type: action.type, payload: action, version });

  // 2) Step through AI plays + trick collection with pauses, pushing each step
  //    over realtime so the table animates naturally instead of jumping.
  for (let i = 0; i < 80; i++) {
    if (state.phase === "game_end" || state.phase === "round_end") break;
    const rr = state.round;
    if (rr.pendingTrickComplete) {
      await sleep(TRICK_PAUSE_MS);
      state = collectTrick(state);
    } else {
      let actor: PlayerId | undefined;
      if (rr.phase === "bidding") actor = rr.bidTurn;
      else if (rr.phase === "declaring") actor = rr.bidder;
      else if (rr.phase === "playing") actor = rr.toPlay;
      if (actor === undefined || !state.players[actor].isAI) break; // hand back to a human
      await sleep(AI_DELAY_MS);
      state = aiMove(state, actor);
    }
    version += 1;
    await saveState(db, gameId, state, seatUser, statusOf(state), version);
  }

  return json({ ok: true, version });
});
