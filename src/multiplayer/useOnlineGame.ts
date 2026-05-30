// Subscribes to a game's server state over Supabase Realtime and assembles a
// renderable GameState: the redacted public_state with the local player's own
// hand injected. Public state never contains other hands or hidden partners.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Card, GameState, PlayerId, RoundState } from "../game/types";
import { getSupabase } from "../lib/supabase";

export interface RosterEntry {
  seat: number;
  user_id: string | null;
  is_ai: boolean;
  display_name: string;
  connected: boolean;
}

export interface OnlineState {
  status: "loading" | "lobby" | "playing" | "done";
  roster: RosterEntry[];
  gameState: GameState | null;
  version: number;
  turnSeconds: number | null;
}

// deno-lint-ignore-file no-explicit-any
function reviveRound(r: any): RoundState {
  return { ...r, passed: new Set<PlayerId>(r?.passed ?? []) };
}
function revivePublic(ps: any): GameState | null {
  if (!ps || !ps.round || !ps.players) return null;
  return {
    ...ps,
    round: reviveRound(ps.round),
    history: (ps.history ?? []).map(reviveRound),
  } as GameState;
}

export function useOnlineGame(gameId: string | null, mySeat: number | null): OnlineState {
  const [state, setState] = useState<OnlineState>({
    status: "loading", roster: [], gameState: null, version: 0, turnSeconds: null,
  });
  const psRef = useRef<any>(null);
  const handRef = useRef<Card[]>([]);

  const assemble = useCallback((): GameState | null => {
    const gs = revivePublic(psRef.current);
    if (gs && mySeat != null && gs.players[mySeat]) {
      gs.players[mySeat].hand = handRef.current;
      gs.round.hands[mySeat as PlayerId] = handRef.current;
    }
    return gs;
  }, [mySeat]);

  useEffect(() => {
    if (!gameId) return;
    let alive = true;
    // deno-lint-ignore no-explicit-any
    let channel: any;

    (async () => {
      const supa = await getSupabase();
      if (!supa || !alive) return;

      const [{ data: game }, { data: players }, { data: hand }] = await Promise.all([
        supa.from("bq_games").select("public_state,status,version,turn_seconds").eq("id", gameId).maybeSingle(),
        supa.from("bq_game_players").select("seat,user_id,is_ai,display_name,connected").eq("game_id", gameId).order("seat"),
        supa.from("bq_hands").select("cards").eq("game_id", gameId).eq("seat", mySeat ?? -1).maybeSingle(),
      ]);
      if (!alive) return;
      psRef.current = game?.public_state ?? null;
      handRef.current = (hand?.cards as Card[]) ?? [];
      setState({
        status: (game?.status as OnlineState["status"]) ?? "lobby",
        roster: (players as RosterEntry[]) ?? [],
        gameState: assemble(),
        version: game?.version ?? 0,
        turnSeconds: (game?.turn_seconds as number | null) ?? null,
      });

      channel = supa.channel(`bqgame:${gameId}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "bq_games", filter: `id=eq.${gameId}` },
          (p: any) => {
            psRef.current = p.new.public_state;
            setState((s) => ({ ...s, status: p.new.status, version: p.new.version, gameState: assemble(), turnSeconds: p.new.turn_seconds ?? null }));
          })
        .on("postgres_changes",
          { event: "*", schema: "public", table: "bq_game_players", filter: `game_id=eq.${gameId}` },
          async () => {
            const { data } = await supa.from("bq_game_players")
              .select("seat,user_id,is_ai,display_name,connected").eq("game_id", gameId).order("seat");
            setState((s) => ({ ...s, roster: (data as RosterEntry[]) ?? [] }));
          })
        .on("postgres_changes",
          { event: "*", schema: "public", table: "bq_hands", filter: `game_id=eq.${gameId}` },
          (p: any) => {
            if (p.new?.seat === mySeat) {
              handRef.current = (p.new.cards as Card[]) ?? [];
              setState((s) => ({ ...s, gameState: assemble() }));
            }
          })
        .subscribe();
    })();

    return () => { alive = false; if (channel) channel.unsubscribe(); };
  }, [gameId, mySeat, assemble]);

  return state;
}
