import { useEffect, useMemo, useRef, useState } from "react";
import { Lobby } from "./components/Lobby";
import { PlayerSeat, SeatPosition } from "./components/PlayerSeat";
import { TrickArea } from "./components/TrickArea";
import { TableCenter } from "./components/TableCenter";
import { TurnHint } from "./components/TurnHint";
import { HandStrip } from "./components/HandStrip";
import { Sidebar } from "./components/Sidebar";
import { BiddingPanel } from "./components/BiddingPanel";
import { DeclarePanel } from "./components/DeclarePanel";
import { RoundEnd } from "./components/RoundEnd";
import { HelpModal } from "./components/HelpModal";
import { PartnerRevealFlash } from "./components/PartnerRevealFlash";
import { Confetti } from "./components/Confetti";
import { SettingsBar } from "./components/SettingsBar";
import { CollectionDeck } from "./components/CollectionDeck";
import { HistoryModal } from "./components/HistoryModal";
import {
  applyBid, applyDeclare, applyPass, applyPlay, collectTrick, freshGame, startNextRound,
} from "./game/engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./game/ai";
import { GameState, PlayerId } from "./game/types";
import { sfx, setMuted } from "./game/sfx";

const SEAT_POSITIONS: SeatPosition[] = ["bottom", "left", "topLeft", "topRight", "right"];

export default function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [me] = useState<PlayerId>(0);
  const [showHands, setShowHands] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(typeof window === "undefined" || window.innerWidth >= 1100);
  const [speed, setSpeed] = useState<"slow" | "normal" | "fast">("normal");
  const speedMul = speed === "slow" ? 1.5 : speed === "fast" ? 0.5 : 1;
  const aiTimerRef = useRef<number | null>(null);
  const lastLogIdRef = useRef<number>(0);
  const lastPhaseRef = useRef<string>("");

  const seatMap = useMemo(() => {
    const map = {} as Record<PlayerId, SeatPosition>;
    for (let i = 0; i < 5; i++) {
      const playerId = ((me + i) % 5) as PlayerId;
      map[playerId] = SEAT_POSITIONS[i];
    }
    return map;
  }, [me]);

  // SFX driver: react to new log entries
  useEffect(() => {
    if (!state) return;
    const newEntries = state.log.filter((l) => l.id > lastLogIdRef.current);
    for (const e of newEntries) {
      if (e.text.includes("plays ")) sfx.cardPlay();
      else if (e.text.includes("bids ")) sfx.bidPlace();
      else if (e.text.includes("passes")) sfx.bidPass();
      else if (e.text.includes("wins the trick")) sfx.trickWin();
      else if (e.text.includes("is the partner")) sfx.partnerReveal();
      else if (e.text.includes("MADE")) sfx.roundMade();
      else if (e.text.includes("FAILED")) sfx.roundFail();
    }
    if (state.phase === "game_end" && lastPhaseRef.current !== "game_end") {
      sfx.gameWin();
    }
    lastPhaseRef.current = state.phase;
    if (state.log.length > 0) lastLogIdRef.current = state.log[state.log.length - 1].id;
  }, [state]);

  useEffect(() => {
    if (!state) return;
    if (state.phase === "game_end" || state.phase === "round_end") return;
    const r = state.round;

    if (r.pendingTrickComplete) {
      aiTimerRef.current = window.setTimeout(() => {
        setState((s) => (s ? collectTrick(s) : s));
      }, 1500 * speedMul);
      return () => {
        if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
      };
    }

    let target: PlayerId | undefined;
    if (r.phase === "bidding") target = r.bidTurn;
    else if (r.phase === "declaring") target = r.bidder;
    else if (r.phase === "playing") target = r.toPlay;
    if (target === undefined) return;
    const targetPlayer = state.players[target];
    if (!targetPlayer.isAI) return;

    const delay = (r.phase === "playing" ? 700 : r.phase === "bidding" ? 500 : 900) * speedMul;
    const captured = target;
    aiTimerRef.current = window.setTimeout(() => {
      setState((s) => {
        if (!s) return s;
        const rr = s.round;
        if (rr.phase === "bidding" && rr.bidTurn === captured) {
          const d = aiBidDecision(s, captured);
          return d.bid === "pass" ? applyPass(s, captured) : applyBid(s, captured, d.bid);
        } else if (rr.phase === "declaring" && rr.bidder === captured) {
          const d = aiDeclareDecision(s, captured);
          return applyDeclare(s, d.trump, d.partnerCard);
        } else if (rr.phase === "playing" && rr.toPlay === captured) {
          const card = aiPlayDecision(s, captured);
          return applyPlay(s, captured, card);
        }
        return s;
      });
    }, delay);
    return () => {
      if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    };
  }, [state]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        setShowHelp((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        if (showHelp) { setShowHelp(false); return; }
      }
      if (!state || state.players[me].isAI) return;
      const r = state.round;
      if (r.phase === "bidding" && r.bidTurn === me) {
        if (e.key === "Escape" || e.key.toLowerCase() === "p") {
          setState((s) => s && applyPass(s, me));
        } else if (e.key === "Enter" || e.key === " ") {
          const min = Math.max(0, ...r.bids.map(b => b.amount)) || 0;
          const next = min === 0 ? 75 : min + 5;
          if (next <= 150) setState((s) => s && applyBid(s, me, next));
        }
      } else if (r.phase === "playing" && r.toPlay === me && !r.pendingTrickComplete) {
        if (e.key === "Enter" || e.key === " ") {
          // play first legal card
          const cards = state.players[me].hand;
          if (cards.length > 0) {
            // approximate: first card sorted by hand
            const lead = r.currentTrick?.plays[0]?.card?.suit;
            const candidates = lead ? cards.filter(c => c.suit === lead) : cards;
            const choice = (candidates.length ? candidates : cards)[0];
            setState((s) => s && applyPlay(s, me, choice));
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state, me, showHelp]);

  if (!state) {
    return (
      <>
        <Lobby onStart={(cfgs, target, shuffleMode) => setState(freshGame(cfgs, target, shuffleMode))} />
        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
        <button
          className="fixed bottom-4 right-4 w-9 h-9 rounded-full glass text-stone-200 hover:bg-white/20"
          onClick={() => setShowHelp(true)}
          title="Help & rules"
        >
          ?
        </button>
      </>
    );
  }

  const r = state.round;
  const showBidPanel = r.phase === "bidding";
  const showDeclarePanel = r.phase === "declaring" && r.bidder === me && !state.players[me].isAI;
  const showRoundEnd = state.phase === "round_end" || state.phase === "game_end";
  const meIsAI = state.players[me].isAI;
  const isGameOver = state.phase === "game_end";

  const toggleMute = () => {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
  };

  return (
    <div className="w-screen h-screen overflow-hidden flex">
      <div className="relative flex-1 felt overflow-hidden min-w-0">
        <div className="absolute inset-x-[10%] inset-y-[14%] rounded-[50%] border border-white/5 shadow-inset pointer-events-none" />

        {state.players.map((p) => {
          const isMe = p.id === me;
          // For the human (bottom seat), the hand strip + sidebar + TurnHint already cover
          // identity, score, turn highlight, and role. Don't render a redundant pill.
          if (isMe && !state.players[me].isAI) return null;
          const pos = seatMap[p.id];
          const myBids = r.bids.filter((b) => b.player === p.id);
          const bidLabel = r.phase === "bidding"
            ? (r.passed.has(p.id) ? "pass" : (myBids.length ? String(myBids[myBids.length - 1].amount) : undefined))
            : undefined;
          return (
            <PlayerSeat
              key={p.id}
              player={p}
              position={pos}
              isActive={
                (r.phase === "bidding" && r.bidTurn === p.id) ||
                (r.phase === "playing" && r.toPlay === p.id && !r.pendingTrickComplete) ||
                (r.phase === "declaring" && r.bidder === p.id)
              }
              isBidder={r.bidder === p.id}
              isPartner={r.revealedPartners?.includes(p.id) ?? false}
              isDealer={r.dealer === p.id}
              showHand={!isMe && showHands}
              isMe={isMe}
              bidLabel={bidLabel}
            />
          );
        })}

        <TurnHint state={state} me={me} />
        <TableCenter state={state} />
        <TrickArea state={state} seatPosition={seatMap} />
        <PartnerRevealFlash state={state} />
        {state.players.map((p) => (
          <CollectionDeck key={`coll-${p.id}`} player={p} position={seatMap[p.id]} />
        ))}

        {!showRoundEnd && !meIsAI && (
          <HandStrip
            state={state}
            me={me}
            onPlay={(c) => setState((s) => s && applyPlay(s, me, c))}
          />
        )}

        {showBidPanel && !meIsAI && (
          <div className="absolute left-4 bottom-4 z-20">
            <BiddingPanel
              state={state}
              me={me}
              onBid={(amt) => setState((s) => s && applyBid(s, me, amt))}
              onPass={() => setState((s) => s && applyPass(s, me))}
            />
          </div>
        )}

        {showDeclarePanel && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30">
            <DeclarePanel
              state={state}
              me={me}
              onDeclare={(t, pc) => setState((s) => s && applyDeclare(s, t, pc))}
            />
          </div>
        )}

        {showRoundEnd && (
          <RoundEnd
            state={state}
            onNext={() => {
              if (isGameOver) setState(null);
              else setState((s) => s && startNextRound(s));
            }}
          />
        )}

        {isGameOver && <Confetti />}

        <SettingsBar
          showHands={showHands}
          setShowHands={setShowHands}
          muted={muted}
          toggleMute={toggleMute}
          onHelp={() => setShowHelp(true)}
          onQuit={() => { if (confirm("Quit current game and return to lobby?")) setState(null); }}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          speed={speed}
          setSpeed={setSpeed}
        />

        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
        {showHistory && <HistoryModal state={state} onClose={() => setShowHistory(false)} />}
      </div>

      {sidebarOpen && (
        <div className="w-72 flex-shrink-0 border-l border-white/10 bg-black/30 p-3 flex flex-col animate-floatIn">
          <Sidebar
            state={state}
            onHelp={() => setShowHelp(true)}
            onHistory={() => setShowHistory(true)}
          />
        </div>
      )}
    </div>
  );
}
