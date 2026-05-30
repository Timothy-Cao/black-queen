// Client wrappers around the Black Queen Edge Functions. Uses a direct fetch
// (rather than supabase.functions.invoke) so we surface our own {error} message
// cleanly on non-2xx responses.
import { getSupabase } from "../lib/supabase";

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function call<T>(fn: string, body: unknown): Promise<T> {
  const supa = await getSupabase();
  if (!supa) throw new Error("Multiplayer is not configured.");
  const { data: { session } } = await supa.auth.getSession();
  if (!session) throw new Error("Please sign in first.");

  const res = await fetch(`${FN_BASE}/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: ANON,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status}).`);
  return json as T;
}

export interface CreateResult { gameId: string; roomCode: string; seat: number; }
export interface JoinResult { gameId: string; seat: number; }

export const createGame = (displayName: string) =>
  call<CreateResult>("bq-create-game", { displayName });

export const joinGame = (roomCode: string, displayName: string) =>
  call<JoinResult>("bq-join-game", { roomCode, displayName });

export const startGame = (gameId: string, aiPersonality = "hard-4", shuffleIntensity = 0) =>
  call<{ ok: boolean }>("bq-start-game", { gameId, aiPersonality, shuffleIntensity });

export const sendMove = (gameId: string, action: unknown) =>
  call<{ ok: boolean; version: number }>("bq-move", { gameId, action });

export const leaveGame = (gameId: string) =>
  call<{ ok: boolean }>("bq-leave-game", { gameId });
