// Online multiplayer flow: Host/Join form → waiting room → live game.
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { createGame, joinGame, startGame, leaveGame } from "../multiplayer/api";
import { useOnlineGame, type RosterEntry } from "../multiplayer/useOnlineGame";
import { OnlineGame } from "./OnlineGame";
import { sfx } from "../game/sfx";

const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

function BackBar({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={onBack}>← Menu</button>
      <h2 className="text-xl font-semibold text-gold-400">{title}</h2>
    </div>
  );
}

export function OnlinePlay({ initialMode, onBack }: { initialMode: "host" | "join"; onBack: () => void }) {
  const { user } = useAuth();
  const displayName = String(
    user?.user_metadata?.name || user?.email?.split("@")[0] || "Player",
  ).slice(0, 24);

  const [gameId, setGameId] = useState<string | null>(null);
  const [mySeat, setMySeat] = useState<number | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const online = useOnlineGame(gameId, mySeat);

  const doCreate = async () => {
    setBusy(true); setError(null); sfx.uiClick();
    try { const r = await createGame(displayName); setGameId(r.gameId); setMySeat(r.seat); setRoomCode(r.roomCode); }
    catch (e) { setError(msg(e)); }
    setBusy(false);
  };
  const doJoin = async () => {
    setBusy(true); setError(null); sfx.uiClick();
    try { const r = await joinGame(joinCode, displayName); setGameId(r.gameId); setMySeat(r.seat); }
    catch (e) { setError(msg(e)); }
    setBusy(false);
  };
  const doStart = async () => {
    if (!gameId) return;
    setBusy(true); setError(null); sfx.uiClick();
    try { await startGame(gameId); } catch (e) { setError(msg(e)); }
    setBusy(false);
  };
  const doLeave = async () => {
    if (gameId) { try { await leaveGame(gameId); } catch { /* ignore */ } }
    setGameId(null); setMySeat(null); onBack();
  };

  // ── In a live/finished game ────────────────────────────────────────────
  if (gameId && (online.status === "playing" || online.status === "done")) {
    return <OnlineGame gameId={gameId} mySeat={mySeat!} online={online} roomCode={roomCode || joinCode} onLeave={doLeave} />;
  }

  // ── Waiting room (lobby) ───────────────────────────────────────────────
  if (gameId) {
    return (
      <WaitingRoom
        code={roomCode || joinCode}
        roster={online.roster}
        isHost={mySeat === 0}
        busy={busy}
        error={error}
        onStart={doStart}
        onLeave={doLeave}
      />
    );
  }

  // ── Host / Join entry forms ────────────────────────────────────────────
  return (
    <div className="w-screen h-screen felt flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-8 w-[min(94vw,480px)] animate-floatIn">
        <BackBar onBack={onBack} title={initialMode === "host" ? "Host a game" : "Join a game"} />
        {initialMode === "host" ? (
          <>
            <p className="text-sm text-stone-300/80">
              Create a private room and share the code. Empty seats are filled with AI; if a player drops, the AI takes over their seat.
            </p>
            <button className="btn btn-primary w-full py-3 mt-6" disabled={busy} onClick={doCreate}>
              {busy ? "Creating…" : "Create room"}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-stone-300/80">Enter the room code your host shared.</p>
            <input
              className="mt-4 w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-center text-xl tracking-[0.3em] uppercase text-stone-100 outline-none focus:border-gold-400/60"
              placeholder="CODE" maxLength={6} value={joinCode} autoComplete="off" autoCapitalize="characters" spellCheck={false}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            />
            <button className="btn btn-primary w-full py-3 mt-5" disabled={busy || joinCode.length < 4} onClick={doJoin}>
              {busy ? "Joining…" : "Join room"}
            </button>
          </>
        )}
        {error && <p className="mt-4 text-[12px] text-rose-300">{error}</p>}
        <div className="mt-5 pt-4 border-t border-white/5 flex items-center gap-2 text-[11px] text-stone-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
          Signed in as <span className="text-stone-300">{displayName}</span>
        </div>
      </div>
    </div>
  );
}

function WaitingRoom({ code, roster, isHost, busy, error, onStart, onLeave }: {
  code: string; roster: RosterEntry[]; isHost: boolean; busy: boolean; error: string | null;
  onStart: () => void; onLeave: () => void;
}) {
  const humans = roster.filter((r) => r.user_id);
  const seats = [0, 1, 2, 3, 4].map((seat) => roster.find((r) => r.seat === seat) ?? null);
  return (
    <div className="w-screen h-screen felt flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-8 w-[min(94vw,480px)] animate-floatIn">
        <div className="text-xs uppercase tracking-widest text-gold-400/80">Room code</div>
        <div className="flex items-center gap-3">
          <div className="font-display text-5xl text-gold-300 tracking-[0.2em]">{code}</div>
          <button
            className="btn btn-ghost text-xs px-2 py-1"
            onClick={() => { sfx.uiClick(); navigator.clipboard?.writeText(code).catch(() => {}); }}
          >
            Copy
          </button>
        </div>
        <p className="mt-1 text-[12px] text-stone-400">Share this code. Empty seats become AI when you start.</p>

        <div className="mt-5 space-y-1.5">
          {seats.map((p, seat) => (
            <div key={seat} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-stone-500 font-mono">{seat + 1}</span>
              {p ? (
                <span className={p.user_id ? "text-stone-100" : "text-stone-400 italic"}>
                  {p.display_name}{p.is_ai ? " (AI)" : ""}{seat === 0 ? " · host" : ""}
                </span>
              ) : (
                <span className="text-stone-600 italic">empty → AI</span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 text-[12px] text-stone-400">{humans.length} player{humans.length === 1 ? "" : "s"} joined</div>

        <div className="mt-6 flex gap-2">
          <button className="btn btn-ghost flex-1 py-2.5" onClick={onLeave}>Leave</button>
          {isHost ? (
            <button className="btn btn-primary flex-1 py-2.5" disabled={busy} onClick={onStart}>
              {busy ? "Starting…" : "Start game"}
            </button>
          ) : (
            <div className="flex-1 py-2.5 text-center text-sm text-stone-400 italic">Waiting for host…</div>
          )}
        </div>
        {error && <p className="mt-3 text-[12px] text-rose-300">{error}</p>}
      </div>
    </div>
  );
}
