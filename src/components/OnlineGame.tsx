// Renders a live online game from server state. The board components are reused
// from single-player; my actions are sent to the bq-move Edge Function instead
// of a local reducer (the server is authoritative and pushes the new state).
import { useEffect, useMemo, useState } from "react";
import type { Card, GameState, PlayerId } from "../game/types";
import { legalPlays } from "../game/rules";
import { PlayerSeat, type SeatPosition } from "./PlayerSeat";
import { TableCenter } from "./TableCenter";
import { TrickArea } from "./TrickArea";
import { TurnHint } from "./TurnHint";
import { HandStrip } from "./HandStrip";
import { BiddingPanel } from "./BiddingPanel";
import { DeclarePanel } from "./DeclarePanel";
import { RoundEnd } from "./RoundEnd";
import { Sidebar } from "./Sidebar";
import { PartnerRevealFlash } from "./PartnerRevealFlash";
import { SettingsModal } from "./SettingsModal";
import { HelpModal } from "./HelpModal";
import { sendMove } from "../multiplayer/api";
import type { OnlineState } from "../multiplayer/useOnlineGame";
import { MobileGame } from "./MobileGame";
import { useIsMobile } from "../hooks/useIsMobile";
import { sfx, getSfxVolume, setSfxVolume } from "../game/sfx";
import { getMusicVolume, setMusicVolume } from "../game/music";

const SEAT_POSITIONS: SeatPosition[] = ["bottom", "left", "topLeft", "topRight", "right"];

// Fill opponents' hands with the right number of face-down placeholders so the
// board shows their remaining card counts (the real cards stay hidden).
function withOpponentCounts(state: GameState, me: number): GameState {
  const r = state.round;
  const played = (p: PlayerId) =>
    r.tricks.length + (r.currentTrick?.plays.some((pl) => pl.player === p) ? 1 : 0);
  const players = state.players.map((p) => {
    if (p.id === me) return p;
    const remaining = Math.max(0, 13 - played(p.id));
    const backs: Card[] = Array.from({ length: remaining }, (_, i) => ({ suit: "S", rank: 2, id: `back-${p.id}-${i}` }));
    return { ...p, hand: backs };
  });
  return { ...state, players };
}

export function OnlineGame({ gameId, mySeat, online, roomCode, onLeave }: {
  gameId: string; mySeat: number; online: OnlineState; roomCode: string; onLeave: () => void;
}) {
  const me = mySeat as PlayerId;
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [musicVol, setMusicVolState] = useState(() => getMusicVolume());
  const [sfxVol, setSfxVolState] = useState(() => getSfxVolume());
  const changeMusic = (v: number) => { setMusicVolState(v); setMusicVolume(v); try { localStorage.setItem("bq:musicVol", String(v)); } catch { /* ignore */ } };
  const changeSfx = (v: number) => { setSfxVolState(v); setSfxVolume(v); try { localStorage.setItem("bq:sfxVol", String(v)); } catch { /* ignore */ } };
  const isMobile = useIsMobile();

  const state = useMemo(
    () => (online.gameState ? withOpponentCounts(online.gameState, me) : null),
    [online.gameState, me],
  );

  const seatMap = useMemo(() => {
    const map = {} as Record<PlayerId, SeatPosition>;
    for (let i = 0; i < 5; i++) map[((me + i) % 5) as PlayerId] = SEAT_POSITIONS[i];
    return map;
  }, [me]);

  const send = async (action: unknown) => {
    if (sending) return;
    setSending(true); setErr(null);
    try { await sendMove(gameId, action); }
    catch (e) { setErr(e instanceof Error ? e.message : "Move failed"); }
    setSending(false);
  };

  // Per-turn timer: count down the local player's actionable turn; on timeout
  // auto-pass (bidding) or auto-play the first legal card (playing).
  const rNow = state?.round;
  const myActionable = !!rNow && (
    (rNow.phase === "bidding" && rNow.bidTurn === me) ||
    (rNow.phase === "playing" && rNow.toPlay === me && !rNow.pendingTrickComplete)
  );
  useEffect(() => {
    if (!state || !myActionable || !online.turnSeconds) { setSecondsLeft(null); return; }
    let rem = online.turnSeconds;
    setSecondsLeft(rem);
    const iv = setInterval(() => {
      rem -= 1; setSecondsLeft(rem);
      if (rem <= 0) {
        clearInterval(iv);
        const rr = state.round;
        if (rr.phase === "bidding") void send({ type: "pass" });
        else {
          const legal = legalPlays(state.players[me].hand, rr.currentTrick);
          if (legal.length) void send({ type: "play", card: legal[0] });
        }
      }
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myActionable, online.turnSeconds, online.version]);

  if (!state) {
    return (
      <div className="w-screen h-screen felt flex items-center justify-center">
        <div className="glass rounded-2xl px-6 py-4 text-stone-300/80 animate-floatIn">Loading game…</div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <>
        <MobileGame
          state={state}
          me={me}
          onPlay={(c) => send({ type: "play", card: c })}
          onBid={(amt) => send({ type: "bid", amount: amt })}
          onPass={() => send({ type: "pass" })}
          onDeclare={(t, pc) => send({ type: "declare", trump: t, partnerCard: pc })}
          onExit={onLeave}
          onRoundNext={onLeave}
          banner={`Room ${roomCode}`}
          secondsLeft={secondsLeft}
        />
        {err && (
          <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-50 glass rounded-lg px-4 py-2 text-sm text-rose-300">{err}</div>
        )}
      </>
    );
  }

  const r = state.round;
  const showRoundEnd = state.phase === "round_end" || state.phase === "game_end";
  const showBidPanel = r.phase === "bidding";
  const showDeclarePanel = r.phase === "declaring" && r.bidder === me;

  return (
    <div className="w-screen h-screen overflow-hidden flex">
      <div className="relative flex-1 felt overflow-hidden min-w-0">
        <div className="absolute inset-x-[10%] inset-y-[14%] rounded-[50%] border border-white/5 shadow-inset pointer-events-none" style={{ zIndex: 0 }} />

        {/* Top bar */}
        <div className="absolute top-2 left-2 z-30 flex items-center gap-2">
          <button className="glass rounded-full px-3 h-9 text-sm text-stone-200 hover:bg-white/10" onClick={onLeave}>← Leave</button>
          <button className="glass rounded-full w-9 h-9 flex items-center justify-center text-base text-stone-200 hover:bg-white/10" onClick={() => { sfx.uiClick(); setShowSettings(true); }} title="Settings">⚙</button>
          <div className="glass rounded-full px-3 h-9 flex items-center text-xs uppercase tracking-widest text-gold-300/90">Room {roomCode}</div>
          {secondsLeft != null && (
            <div className={`glass rounded-full px-3 h-9 flex items-center text-sm font-mono ${secondsLeft <= 5 ? "text-rose-400" : "text-stone-200"}`}>⏱ {secondsLeft}s</div>
          )}
        </div>

        {state.players.map((p) => (
          <PlayerSeat
            key={p.id}
            player={p}
            isActive={r.phase === "playing" ? r.toPlay === p.id : r.phase === "bidding" ? r.bidTurn === p.id : r.bidder === p.id}
            isBidder={r.bidder === p.id}
            isPartner={(r.revealedPartners ?? []).includes(p.id)}
            isDealer={r.dealer === p.id}
            isMe={p.id === me}
            position={seatMap[p.id]}
          />
        ))}

        <TurnHint state={state} me={me} />
        <TableCenter state={state} />
        <TrickArea state={state} seatPosition={seatMap} onContinue={() => { /* server auto-collects */ }} />
        <PartnerRevealFlash state={state} />

        {!showRoundEnd && (
          <HandStrip state={state} me={me} onPlay={(c) => send({ type: "play", card: c })} />
        )}

        {showBidPanel && (
          <div className="absolute left-4 bottom-4 z-20">
            <BiddingPanel
              state={state}
              me={me}
              onBid={(amt) => send({ type: "bid", amount: amt })}
              onPass={() => send({ type: "pass" })}
            />
          </div>
        )}

        {showDeclarePanel && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30">
            <DeclarePanel state={state} me={me} onDeclare={(t, pc) => send({ type: "declare", trump: t, partnerCard: pc })} />
          </div>
        )}

        {showRoundEnd && (
          <RoundEnd state={state} onNext={onLeave} />
        )}

        {err && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 glass rounded-lg px-4 py-2 text-sm text-rose-300 animate-floatIn">{err}</div>
        )}

        {showSettings && (
          <SettingsModal
            onClose={() => setShowSettings(false)}
            subtitle={`Room ${roomCode}`}
            musicVol={musicVol} setMusicVol={changeMusic}
            sfxVol={sfxVol} setSfxVol={changeSfx}
            onHelp={() => { setShowSettings(false); setShowHelp(true); }}
            onQuit={onLeave}
          />
        )}
        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      </div>

      <div className="w-72 flex-shrink-0 border-l border-white/10 bg-black/30 p-3 hidden md:flex flex-col">
        <Sidebar state={state} />
      </div>
    </div>
  );
}
