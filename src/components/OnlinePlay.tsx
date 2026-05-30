// Online multiplayer flow: Host/Join (+ admin room browser) → waiting room
// (host settings) → live game. Leaving / navigating away frees the seat.
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  createGame, joinGame, joinById, startGame, leaveGame, listRooms, deleteRoom,
  type RoomSummary,
} from "../multiplayer/api";
import { useOnlineGame, type RosterEntry } from "../multiplayer/useOnlineGame";
import { OnlineGame } from "./OnlineGame";
import { sfx } from "../game/sfx";

const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

const SHUFFLE_STOPS = [
  { label: "Chaos", intensity: 0 },
  { label: "Fun", intensity: 0.33 },
  { label: "Standard", intensity: 0.66 },
  { label: "Uniform", intensity: 1 },
];
const TURN_OPTIONS: { label: string; value: number | null }[] = [
  { label: "15s", value: 15 }, { label: "30s", value: 30 }, { label: "60s", value: 60 }, { label: "Unlimited", value: null },
];

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

  // Host settings.
  const [shuffleStep, setShuffleStep] = useState(1); // default: Fun
  const [turnSeconds, setTurnSeconds] = useState<number | null>(30);

  // Admin room browser (join screen).
  const [adminRooms, setAdminRooms] = useState<RoomSummary[] | null>(null);

  const online = useOnlineGame(gameId, mySeat);

  // Free the seat when the player navigates away / closes the tab.
  const gameIdRef = useRef<string | null>(null);
  gameIdRef.current = gameId;
  useEffect(() => {
    const drop = () => { if (gameIdRef.current) leaveGame(gameIdRef.current).catch(() => {}); };
    window.addEventListener("pagehide", drop);
    return () => {
      window.removeEventListener("pagehide", drop);
      drop();
    };
  }, []);

  // Admins: load the room browser on the Join screen.
  const refreshRooms = async () => {
    try { const { rooms } = await listRooms(); setAdminRooms(rooms); }
    catch { setAdminRooms(null); } // non-admin → 403
  };
  useEffect(() => {
    if (initialMode === "join" && !gameId) void refreshRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, gameId]);

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
  const doJoinById = async (id: string) => {
    setBusy(true); setError(null); sfx.uiClick();
    try { const r = await joinById(id, displayName); setGameId(r.gameId); setMySeat(r.seat); }
    catch (e) { setError(msg(e)); }
    setBusy(false);
  };
  const doDelete = async (id: string) => {
    sfx.uiClick();
    try { await deleteRoom(id); await refreshRooms(); } catch (e) { setError(msg(e)); }
  };
  const doStart = async () => {
    if (!gameId) return;
    setBusy(true); setError(null); sfx.uiClick();
    try { await startGame(gameId, { shuffleIntensity: SHUFFLE_STOPS[shuffleStep].intensity, turnSeconds }); }
    catch (e) { setError(msg(e)); }
    setBusy(false);
  };
  const doLeave = async () => {
    if (gameId) { try { await leaveGame(gameId); } catch { /* ignore */ } }
    setGameId(null); setMySeat(null); onBack();
  };

  // ── Live / finished game ───────────────────────────────────────────────
  if (gameId && (online.status === "playing" || online.status === "done")) {
    return <OnlineGame gameId={gameId} mySeat={mySeat!} online={online} roomCode={roomCode || joinCode} onLeave={doLeave} />;
  }

  // ── Waiting room (lobby) ───────────────────────────────────────────────
  if (gameId) {
    const humanSeats = online.roster.filter((r) => r.user_id).map((r) => r.seat);
    const lowestHuman = humanSeats.length ? Math.min(...humanSeats) : mySeat ?? 0;
    return (
      <WaitingRoom
        code={roomCode || joinCode}
        roster={online.roster}
        isHost={mySeat === lowestHuman}
        busy={busy}
        error={error}
        shuffleStep={shuffleStep} setShuffleStep={setShuffleStep}
        turnSeconds={turnSeconds} setTurnSeconds={setTurnSeconds}
        onStart={doStart}
        onLeave={doLeave}
      />
    );
  }

  // ── Host / Join entry ──────────────────────────────────────────────────
  return (
    <div className="w-screen h-screen felt flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-8 w-[min(94vw,480px)] max-h-[92vh] overflow-auto animate-floatIn">
        <BackBar onBack={onBack} title={initialMode === "host" ? "Host a game" : "Join a game"} />
        {initialMode === "host" ? (
          <button className="btn btn-primary w-full py-3 mt-2" disabled={busy} onClick={doCreate}>
            {busy ? "Creating…" : "Create room"}
          </button>
        ) : (
          <>
            {/* Admin room browser */}
            {adminRooms && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs uppercase tracking-widest text-gold-400/80">All rooms (admin)</div>
                  <button className="text-[11px] text-stone-400 hover:text-stone-100 underline" onClick={refreshRooms}>Refresh</button>
                </div>
                {adminRooms.length === 0 ? (
                  <div className="text-[12px] text-stone-500 italic">No active rooms.</div>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-auto pr-1">
                    {adminRooms.map((rm) => (
                      <div key={rm.id} className="flex items-center gap-2 text-sm bg-black/20 rounded-lg px-2.5 py-1.5">
                        <span className="font-mono text-gold-300">{rm.roomCode}</span>
                        <span className="text-[11px] text-stone-400">{rm.status} · {rm.humans}/{rm.total}</span>
                        <div className="ml-auto flex gap-1.5">
                          {rm.status === "lobby" && (
                            <button className="text-[11px] px-2 py-1 rounded bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25" onClick={() => doJoinById(rm.id)} disabled={busy}>Join</button>
                          )}
                          <button className="text-[11px] px-2 py-1 rounded bg-rose-500/15 text-rose-200 hover:bg-rose-500/25" onClick={() => doDelete(rm.id)}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-t border-white/5 mt-4 pt-4 text-xs uppercase tracking-widest text-gold-400/80">Or join by code</div>
              </div>
            )}
            <input
              className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-center text-xl tracking-[0.3em] uppercase text-stone-100 outline-none focus:border-gold-400/60"
              placeholder="CODE" maxLength={6} value={joinCode} autoComplete="off" autoCapitalize="characters" spellCheck={false}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            />
            <button className="btn btn-primary w-full py-3 mt-4" disabled={busy || joinCode.length < 4} onClick={doJoin}>
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

function WaitingRoom(props: {
  code: string; roster: RosterEntry[]; isHost: boolean; busy: boolean; error: string | null;
  shuffleStep: number; setShuffleStep: (n: number) => void;
  turnSeconds: number | null; setTurnSeconds: (v: number | null) => void;
  onStart: () => void; onLeave: () => void;
}) {
  const { code, roster, isHost } = props;
  const humans = roster.filter((r) => r.user_id);
  const seats = [0, 1, 2, 3, 4].map((seat) => roster.find((r) => r.seat === seat) ?? null);
  return (
    <div className="w-screen h-screen felt flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-8 w-[min(94vw,480px)] max-h-[92vh] overflow-auto animate-floatIn">
        <div className="text-xs uppercase tracking-widest text-gold-400/80">Room code</div>
        <div className="flex items-center gap-3">
          <div className="font-display text-5xl text-gold-300 tracking-[0.2em]">{code}</div>
          <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => { sfx.uiClick(); navigator.clipboard?.writeText(code).catch(() => {}); }}>Copy</button>
        </div>
        <p className="mt-1 text-[12px] text-stone-400">Share this code. Empty seats become AI when you start.</p>

        <div className="mt-5 space-y-1.5">
          {seats.map((p, seat) => (
            <div key={seat} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-stone-500 font-mono">{seat + 1}</span>
              {p ? (
                <span className={p.user_id ? "text-stone-100" : "text-stone-400 italic"}>
                  {p.display_name}{p.is_ai ? " (AI)" : ""}
                </span>
              ) : (
                <span className="text-stone-600 italic">empty → AI</span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 text-[12px] text-stone-400">{humans.length} player{humans.length === 1 ? "" : "s"} joined</div>

        {/* Host settings */}
        {isHost && (
          <div className="mt-5 space-y-4 border-t border-white/5 pt-4">
            <Setting label="Shuffle">
              {SHUFFLE_STOPS.map((s, i) => (
                <Seg key={s.label} active={props.shuffleStep === i} onClick={() => { sfx.uiClick(); props.setShuffleStep(i); }}>{s.label}</Seg>
              ))}
            </Setting>
            <Setting label="Turn time">
              {TURN_OPTIONS.map((t) => (
                <Seg key={t.label} active={props.turnSeconds === t.value} onClick={() => { sfx.uiClick(); props.setTurnSeconds(t.value); }}>{t.label}</Seg>
              ))}
            </Setting>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button className="btn btn-ghost flex-1 py-2.5" onClick={props.onLeave}>Leave</button>
          {isHost ? (
            <button className="btn btn-primary flex-1 py-2.5" disabled={props.busy} onClick={props.onStart}>
              {props.busy ? "Starting…" : "Start game"}
            </button>
          ) : (
            <div className="flex-1 py-2.5 text-center text-sm text-stone-400 italic">Waiting for host…</div>
          )}
        </div>
        {props.error && <p className="mt-3 text-[12px] text-rose-300">{props.error}</p>}
      </div>
    </div>
  );
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1.5">{label}</div>
      <div className="flex gap-1.5 flex-wrap">{children}</div>
    </div>
  );
}
function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${active ? "bg-gold-500/25 text-gold-200" : "bg-white/5 text-stone-400 hover:bg-white/10"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
