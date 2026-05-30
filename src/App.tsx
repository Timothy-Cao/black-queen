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
import { AIInfoPage } from "./components/AIInfoPage";
import { MainMenu } from "./components/MainMenu";
import { Leaderboard } from "./components/Leaderboard";
import { MultiplayerHost, MultiplayerJoin } from "./components/Multiplayer";
import { SignIn } from "./components/SignIn";
import { useAuth } from "./auth/AuthContext";
import { PartnerRevealFlash } from "./components/PartnerRevealFlash";
import { Confetti } from "./components/Confetti";
import { SettingsBar } from "./components/SettingsBar";
import { SettingsModal } from "./components/SettingsModal";
import { CollectionDeck } from "./components/CollectionDeck";
import { HistoryModal } from "./components/HistoryModal";
import {
  applyBid, applyDeclare, applyPass, applyPlay, collectTrick, freshGame, startNextRound,
} from "./game/engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./game/ai";
import { GameState, PlayerId } from "./game/types";
import { sfx, setSfxVolume } from "./game/sfx";
import { playScene, duckMusic, setMusicVolume, resumeAudio } from "./game/music";

const SEAT_POSITIONS: SeatPosition[] = ["bottom", "left", "topLeft", "topRight", "right"];

export default function App() {
  const { configured: authConfigured, loading: authLoading, session } = useAuth();
  const [state, setState] = useState<GameState | null>(null);
  const [me] = useState<PlayerId>(0);
  const [showHands, setShowHands] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [route, setRoute] = useState<string>(() => typeof window !== "undefined" ? window.location.pathname : "/");
  const [showHistory, setShowHistory] = useState(false);

  // Routing: keep `route` in sync with the URL and the back/forward buttons.
  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = (to: string) => {
    if (window.location.pathname === to) return;
    window.history.pushState({}, "", to);
    setRoute(to);
  };
  const openAIInfo = () => navigate("/ai");
  const closeAIInfo = () => navigate("/");
  const onAIInfoRoute = route === "/ai";
  // Audio volumes in [0,1], persisted independently. Migrates the old single
  // mute flag: if the user had muted, start both at 0.
  const [musicVol, setMusicVol] = useState<number>(() => {
    try {
      const v = localStorage.getItem("bq:musicVol");
      if (v !== null) return Math.max(0, Math.min(1, parseFloat(v)));
      return localStorage.getItem("bq:muted") === "1" ? 0 : 0.3;
    } catch { return 0.3; }
  });
  const [sfxVol, setSfxVol] = useState<number>(() => {
    try {
      const v = localStorage.getItem("bq:sfxVol");
      if (v !== null) return Math.max(0, Math.min(1, parseFloat(v)));
      return localStorage.getItem("bq:muted") === "1" ? 0 : 0.8;
    } catch { return 0.8; }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Info panel is always open for now (no toggle exposed).
  const sidebarOpen = true;
  const [speed, setSpeed] = useState<"slow" | "normal" | "fast">(() => {
    try { const v = localStorage.getItem("bq:speed"); return v === "slow" || v === "fast" ? v : "normal"; } catch { return "normal"; }
  });
  // Apply + persist audio volumes and speed.
  useEffect(() => { setSfxVolume(sfxVol); try { localStorage.setItem("bq:sfxVol", String(sfxVol)); } catch { /* ignore */ } }, [sfxVol]);
  useEffect(() => { setMusicVolume(musicVol); try { localStorage.setItem("bq:musicVol", String(musicVol)); } catch { /* ignore */ } }, [musicVol]);
  useEffect(() => { try { localStorage.setItem("bq:speed", speed); } catch { /* ignore */ } }, [speed]);
  const speedMul = speed === "slow" ? 1.6 : speed === "fast" ? 0.55 : 1;
  const aiTimerRef = useRef<number | null>(null);
  const lastLogIdRef = useRef<number>(0);
  const lastPhaseRef = useRef<string>("");
  const prevMyTurnRef = useRef<boolean>(false);

  // ---- Music: crossfade between a menu loop and a gameplay loop. ----
  const musicScene: "menu" | "game" = state ? "game" : "menu";
  useEffect(() => { void playScene(musicScene); }, [musicScene]);
  // Browsers block autoplay until a user gesture; resume on the first one.
  useEffect(() => {
    const kick = () => { void resumeAudio(); };
    window.addEventListener("pointerdown", kick, { once: true });
    window.addEventListener("keydown", kick, { once: true });
    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
    };
  }, []);

  // ---- "Your turn" cue: chime on the rising edge of the human's actionable turn. ----
  useEffect(() => {
    let myTurn = false;
    if (state && !state.players[me].isAI && !settingsOpen) {
      const r = state.round;
      myTurn =
        (r.phase === "bidding" && r.bidTurn === me) ||
        (r.phase === "playing" && r.toPlay === me && !r.pendingTrickComplete);
    }
    if (myTurn && !prevMyTurnRef.current) sfx.yourTurn();
    prevMyTurnRef.current = myTurn;
  }, [state, me, settingsOpen]);
  const [declareHidden, setDeclareHidden] = useState(false);
  const [roundEndHidden, setRoundEndHidden] = useState(false);

  // Reset hide-state when entering a new round / new declaring phase
  const declarePhaseKey = `${state?.round.roundNumber}-${state?.phase}`;
  useEffect(() => { setDeclareHidden(false); setRoundEndHidden(false); }, [declarePhaseKey]);

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
      else if (e.text.includes("wins the round")) sfx.trickWin();
      else if (e.text.includes("is the partner")) { sfx.partnerReveal(); duckMusic(1400); }
      else if (e.text.includes("MADE")) { sfx.roundMade(); duckMusic(); }
      else if (e.text.includes("FAILED")) { sfx.roundFail(); duckMusic(); }
    }
    if (state.phase === "game_end" && lastPhaseRef.current !== "game_end") {
      // Win/lose sting from the human's perspective.
      const rr = state.round;
      const teamIds = new Set<PlayerId>([rr.bidder!, ...(rr.partners ?? [])]);
      const tp = ([0, 1, 2, 3, 4] as PlayerId[])
        .filter((p) => teamIds.has(p))
        .reduce<number>((s, p) => s + (rr.roundPoints?.[p] ?? 0), 0);
      const made = tp >= (rr.winningBid ?? 0);
      const humanWon = teamIds.has(me) ? made : !made;
      if (humanWon) sfx.gameWin(); else sfx.gameLose();
      duckMusic(2600);
    }
    lastPhaseRef.current = state.phase;
    if (state.log.length > 0) lastLogIdRef.current = state.log[state.log.length - 1].id;
  }, [state]);

  useEffect(() => {
    if (!state) return;
    if (settingsOpen) return; // game is paused while the settings overlay is open
    if (state.phase === "game_end" || state.phase === "round_end") return;
    const r = state.round;

    // Round completion is no longer auto-resolved by a timer. The player
    // clicks "Continue" (rendered inside TrickArea) to advance.
    if (r.pendingTrickComplete) return;

    let target: PlayerId | undefined;
    if (r.phase === "bidding") target = r.bidTurn;
    else if (r.phase === "declaring") target = r.bidder;
    else if (r.phase === "playing") target = r.toPlay;
    if (target === undefined) return;
    const targetPlayer = state.players[target];
    if (!targetPlayer.isAI) return;

    const delay = (r.phase === "playing" ? 1100 : r.phase === "bidding" ? 800 : 1300) * speedMul;
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
  }, [state, settingsOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore typing in fields — but always let Escape through (e.g. to close
      // Settings even while a volume slider is focused).
      if ((e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) && e.key !== "Escape") return;
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        setShowHelp((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        // Esc closes the topmost overlay, otherwise opens Settings (in game).
        if (settingsOpen) { setSettingsOpen(false); return; }
        if (showHelp) { setShowHelp(false); return; }
        if (state) { setSettingsOpen(true); }
        return;
      }
      if (settingsOpen) return; // game is paused; ignore play shortcuts
      if (!state || state.players[me].isAI) return;
      const r = state.round;
      if (r.phase === "bidding" && r.bidTurn === me) {
        if (e.key.toLowerCase() === "p") {
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
  }, [state, me, showHelp, settingsOpen]);

  // Auth is required ONLY for online multiplayer (see the /host & /join branches
  // below). Single player, AI Notes, and How to Play never require sign-in.
  const needsAuthGate = authConfigured && !session;

  // /ai route: render the AI Info page instead of the game (full page replacement).
  if (onAIInfoRoute) {
    return <AIInfoPage onBack={closeAIInfo} />;
  }

  // No active game → menu system (route-based so back/forward + sharing work).
  if (!state) {
    const help = showHelp && (
      <HelpModal
        onClose={() => setShowHelp(false)}
        onOpenAIInfo={() => { setShowHelp(false); openAIInfo(); }}
      />
    );

    // Multiplayer requires sign-in (only when Supabase is configured).
    if (route === "/leaderboard") return <><Leaderboard onBack={() => navigate("/")} />{help}</>;

    if (route === "/host" || route === "/join") {
      if (authConfigured && authLoading) {
        return (
          <div className="w-screen h-screen felt flex items-center justify-center">
            <div className="glass rounded-2xl px-6 py-4 text-stone-300/80 animate-floatIn">Loading…</div>
          </div>
        );
      }
      if (needsAuthGate) {
        return <SignIn onBack={() => navigate("/")} reason="Sign in with Google to play online." />;
      }
      return route === "/host"
        ? <><MultiplayerHost onBack={() => navigate("/")} />{help}</>
        : <><MultiplayerJoin onBack={() => navigate("/")} />{help}</>;
    }

    if (route === "/play") {
      return (
        <>
          <button
            className="fixed top-4 left-4 z-50 btn btn-ghost px-3 py-1.5 text-sm"
            onClick={() => navigate("/")}
          >
            ← Menu
          </button>
          <Lobby
            onStart={(cfgs, target, shuffleIntensity, randomizeShuffle) => {
              // Single-player has exactly one local controller (seat 0). Force
              // every other seat to AI so a non-seat-0 human can never stall the
              // game (no input UI exists for them). Seat 0 may be human OR AI
              // (AI seat 0 = spectate / all-AI mode).
              const safe = cfgs.map((c, i) =>
                i === 0 ? c : { ...c, isAI: true, aiPersonality: c.aiPersonality ?? "hard-3" },
              );
              setState(freshGame(
                safe, target,
                shuffleIntensity >= 0.5 ? "full" : "light",
                shuffleIntensity,
                randomizeShuffle,
              ));
            }}
            onOpenAIInfo={openAIInfo}
          />
          {help}
        </>
      );
    }

    // Default route "/" → main menu.
    return (
      <>
        <MainMenu
          onSinglePlayer={() => navigate("/play")}
          onHost={() => navigate("/host")}
          onJoin={() => navigate("/join")}
          onLeaderboard={() => navigate("/leaderboard")}
          onAIInfo={openAIInfo}
          onHowToPlay={() => setShowHelp(true)}
          musicVol={musicVol}
          setMusicVol={setMusicVol}
          sfxVol={sfxVol}
          setSfxVol={setSfxVol}
        />
        {help}
      </>
    );
  }

  const r = state.round;
  const showBidPanel = r.phase === "bidding";
  const showDeclarePanel = r.phase === "declaring" && r.bidder === me && !state.players[me].isAI;
  const showRoundEnd = state.phase === "round_end" || state.phase === "game_end";
  const meIsAI = state.players[me].isAI;
  const isGameOver = state.phase === "game_end";
  // Perfect game: caller's team captured every point in the deck (300).
  const callerTeamPoints = (() => {
    const rr = state.round;
    const teamIds = new Set<PlayerId>([rr.bidder!, ...(rr.partners ?? [])]);
    return ([0, 1, 2, 3, 4] as PlayerId[])
      .filter((p) => teamIds.has(p))
      .reduce<number>((s, p) => s + (rr.roundPoints?.[p] ?? 0), 0);
  })();
  const isPerfect300 = isGameOver && callerTeamPoints === 300;

  return (
    <div className="w-screen h-screen overflow-hidden flex">
      <nav
        aria-label="Legal links"
        className="fixed bottom-4 left-4 z-50 flex gap-2 rounded-lg bg-black/35 px-2 py-1 text-[11px] text-stone-300/75 backdrop-blur-sm"
      >
        <a className="hover:text-stone-100" href="/privacy.html">Privacy</a>
        <a className="hover:text-stone-100" href="mailto:timcao.support@gmail.com">Contact</a>
      </nav>
      <div className="relative flex-1 felt overflow-hidden min-w-0">
        <div className="absolute inset-x-[10%] inset-y-[14%] rounded-[50%] border border-white/5 shadow-inset pointer-events-none" style={{ zIndex: 0 }} />

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
        <TrickArea
          state={state}
          seatPosition={seatMap}
          onContinue={() => setState((s) => (s ? collectTrick(s) : s))}
        />
        <PartnerRevealFlash state={state} />
        {/* The human (bottom seat) hides their own seat, so show their pile separately. */}
        {!meIsAI && state.players[me].tricksWon.length > 0 && (
          <CollectionDeck player={state.players[me]} position="bottom" />
        )}

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

        {showDeclarePanel && !declareHidden && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30">
            <DeclarePanel
              state={state}
              me={me}
              onDeclare={(t, pc) => setState((s) => s && applyDeclare(s, t, pc))}
              onHide={() => setDeclareHidden(true)}
            />
          </div>
        )}
        {showDeclarePanel && declareHidden && (
          <button
            className="absolute bottom-20 right-4 z-30 glass px-3 py-2 rounded-xl text-sm text-gold-400 hover:bg-white/10 shadow-lg animate-floatIn"
            onClick={() => setDeclareHidden(false)}
          >
            ↑ Re-open declare
          </button>
        )}

        {showRoundEnd && !roundEndHidden && (
          <RoundEnd
            state={state}
            onNext={() => {
              if (isGameOver) setState(null);
              else setState((s) => s && startNextRound(s));
            }}
            onHide={() => setRoundEndHidden(true)}
          />
        )}
        {showRoundEnd && roundEndHidden && (
          <button
            className="absolute bottom-20 right-4 z-30 glass px-3 py-2 rounded-xl text-sm text-gold-400 hover:bg-white/10 shadow-lg animate-floatIn"
            onClick={() => setRoundEndHidden(false)}
          >
            ↑ Re-open round summary
          </button>
        )}

        {/* Confetti only on a perfect 300-point game (handled in RoundEnd). */}
        {isGameOver && isPerfect300 && <Confetti />}

        <SettingsBar
          onOpenSettings={() => setSettingsOpen(true)}
          speed={speed}
          setSpeed={setSpeed}
        />

        {settingsOpen && (
          <SettingsModal
            onClose={() => setSettingsOpen(false)}
            musicVol={musicVol}
            setMusicVol={setMusicVol}
            sfxVol={sfxVol}
            setSfxVol={setSfxVol}
            speed={speed}
            setSpeed={setSpeed}
            showHands={showHands}
            setShowHands={setShowHands}
            onHelp={() => { setSettingsOpen(false); setShowHelp(true); }}
            onQuit={() => { setSettingsOpen(false); setState(null); }}
          />
        )}

        {showHelp && (
          <HelpModal
            onClose={() => setShowHelp(false)}
            onOpenAIInfo={() => { setShowHelp(false); openAIInfo(); }}
          />
        )}
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
