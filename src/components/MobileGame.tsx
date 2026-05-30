// Vertical, phone-first game layout. Used (in place of the desktop ellipse
// table) on narrow screens for both single-player and online games.
//
// Opponents are compact status chips (avatar · card count · points · role) with
// no fanned card-backs; the current trick sits in the middle; the local hand
// fans to fit the screen width with tap-to-select + a confirm to play.
import { useEffect, useMemo, useState } from "react";
import type { Card, GameState, PlayerId, Suit } from "../game/types";
import { SUIT_GLYPHS, cardPoints } from "../game/types";
import { CardView } from "./CardView";
import { BiddingPanel } from "./BiddingPanel";
import { DeclarePanel } from "./DeclarePanel";
import { RoundEnd } from "./RoundEnd";
import { legalPlays } from "../game/rules";
import { avatarColor, seatIcon } from "./PlayerSeat";
import { sfx } from "../game/sfx";

interface Props {
  state: GameState;
  me: PlayerId;
  onPlay: (c: Card) => void;
  onBid: (amount: number) => void;
  onPass: () => void;
  onDeclare: (trump: Suit, partnerCard: Card) => void;
  onContinue?: () => void;     // collect a completed trick (single-player)
  onRoundNext?: () => void;    // RoundEnd primary action
  onExit: () => void;          // leave / back
  banner?: string;             // room code (online)
}

const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };

function sortForHand(hand: Card[], trump?: Suit): Card[] {
  const rank = (s: Suit) => (s === trump ? -1 : SUIT_ORDER[s]);
  return hand.slice().sort((a, b) => rank(a.suit) - rank(b.suit) || b.rank - a.rank);
}

export function MobileGame(p: Props) {
  const { state, me } = p;
  const r = state.round;
  const trump = r.trump;
  const showRoundEnd = state.phase === "round_end" || state.phase === "game_end";
  const myTurnToPlay = r.phase === "playing" && r.toPlay === me && !r.pendingTrickComplete;
  const showBidPanel = r.phase === "bidding";
  const showDeclare = r.phase === "declaring" && r.bidder === me;

  const [selected, setSelected] = useState<string | null>(null);
  const [width, setWidth] = useState<number>(() => (typeof window !== "undefined" ? window.innerWidth : 380));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const legalIds = useMemo(() => {
    if (!myTurnToPlay) return new Set<string>();
    return new Set(legalPlays(state.players[me].hand, r.currentTrick).map((c) => c.id));
  }, [myTurnToPlay, state, me, r.currentTrick]);

  // Opponents in clockwise seat order starting after me.
  const opponents = [1, 2, 3, 4].map((i) => state.players[((me + i) % 5) as PlayerId]);
  const hand = sortForHand(state.players[me].hand, trump);
  const trickPlays = r.currentTrick?.plays ?? [];

  const turnText = (() => {
    if (showRoundEnd) return null;
    if (r.phase === "bidding") return r.bidTurn === me ? "Your turn to bid" : `${state.players[r.bidTurn ?? me].name} is bidding`;
    if (r.phase === "declaring") return r.bidder === me ? "Choose trump & partner" : `${state.players[r.bidder!].name} is declaring`;
    if (r.pendingTrickComplete) return "Trick complete";
    if (r.phase === "playing") return r.toPlay === me ? "Your turn — pick a card" : `${state.players[r.toPlay].name}'s turn`;
    return null;
  })();

  // Fan geometry: fit all cards within the screen width.
  const CARD_W = 52;
  const avail = Math.min(width, 560) - 16;
  const step = hand.length > 1
    ? Math.max(16, Math.min(CARD_W - 6, (avail - CARD_W) / (hand.length - 1)))
    : CARD_W;
  const overlap = CARD_W - step;

  const selectedCard = hand.find((c) => c.id === selected) ?? null;

  const tapCard = (c: Card) => {
    if (!myTurnToPlay) return;
    if (!legalIds.has(c.id)) { sfx.illegalMove(); return; }
    sfx.uiClick();
    setSelected((s) => (s === c.id ? null : c.id));
  };
  const confirmPlay = () => {
    if (selectedCard) { p.onPlay(selectedCard); setSelected(null); }
  };

  return (
    <div className="w-screen h-[100dvh] felt flex flex-col overflow-hidden select-none">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs border-b border-white/10 bg-black/20">
        <button className="glass rounded-full px-2.5 py-1 text-stone-200" onClick={p.onExit}>←</button>
        {p.banner && <span className="uppercase tracking-widest text-gold-300/90 text-[10px]">{p.banner}</span>}
        <div className="ml-auto flex items-center gap-2 text-[11px] text-stone-300">
          {r.winningBid != null && <span>Bid <b className="text-gold-300">{r.winningBid}</b></span>}
          {trump && <span className={trump === "H" || trump === "D" ? "text-rose-400" : "text-stone-100"}>{SUIT_GLYPHS[trump]}</span>}
        </div>
      </div>

      {/* Opponents */}
      <div className="flex justify-around items-start gap-1 px-1 py-2">
        {opponents.map((pl) => {
          const active = r.phase === "playing" ? r.toPlay === pl.id : r.phase === "bidding" ? r.bidTurn === pl.id : r.bidder === pl.id;
          const isCaller = r.bidder === pl.id;
          const isPartner = (r.revealedPartners ?? []).includes(pl.id);
          const captured = pl.tricksWon.reduce((s, c) => s + cardPoints(c), 0);
          return (
            <div key={pl.id} className={`flex flex-col items-center gap-0.5 px-1 py-1 rounded-xl ${active ? "ring-2 ring-gold-400 bg-gold-500/10" : ""}`}>
              <div className="relative w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-lg"
                style={{ background: pl.isAI ? avatarColor(pl.id) : "#e0a93a", boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.12)" }}>
                <img src={seatIcon(pl.id)} alt="" className="w-full h-full object-cover" />
                <span className="absolute -bottom-0.5 -right-0.5 bg-black/85 text-[9px] leading-none px-1 py-0.5 rounded-full text-stone-200 font-mono">{pl.hand.length}</span>
              </div>
              <div className="text-[10px] text-stone-200 truncate max-w-[70px] leading-tight">
                {pl.name}{isCaller && <span className="text-gold-400"> ★</span>}{isPartner && <span className="text-amber-300"> ◆</span>}
              </div>
              <div className="text-[10px] text-gold-400 font-mono leading-none">{captured}</div>
            </div>
          );
        })}
      </div>

      {/* Turn banner */}
      {turnText && (
        <div className="text-center text-[11px] uppercase tracking-widest text-gold-400/90 py-1">{turnText}</div>
      )}

      {/* Center: current trick */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-2">
        {trickPlays.length > 0 ? (
          <div className="flex justify-center items-end gap-1.5 flex-wrap">
            {trickPlays.map((tp) => (
              <div key={`${tp.player}-${tp.card.id}`} className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] text-stone-400 truncate max-w-[48px]">{state.players[tp.player].name}</span>
                <CardView card={tp.card} small staticView />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-stone-500 text-xs italic">{r.phase === "playing" ? "Waiting for the lead…" : ""}</div>
        )}
      </div>

      {/* Continue (single-player trick collect) */}
      {r.pendingTrickComplete && p.onContinue && (
        <div className="px-3 pb-2">
          <button className="btn btn-primary w-full py-2.5" onClick={p.onContinue}>Continue</button>
        </div>
      )}

      {/* Bidding panel */}
      {showBidPanel && (
        <div className="px-2 pb-2 flex justify-center">
          <BiddingPanel state={state} me={me} onBid={p.onBid} onPass={p.onPass} />
        </div>
      )}

      {/* Confirm-play bar */}
      {myTurnToPlay && selectedCard && (
        <div className="px-3 pb-1.5 flex items-center gap-2">
          <button className="flex-1 btn btn-primary py-2.5" onClick={confirmPlay}>
            Play {SUIT_GLYPHS[selectedCard.suit]}{rankLabel(selectedCard.rank)}
          </button>
          <button className="btn btn-ghost py-2.5 px-3" onClick={() => setSelected(null)}>✕</button>
        </div>
      )}

      {/* My hand (fanned to fit width, tap to select) */}
      {!showRoundEnd && (
        <div className="pb-2 pt-1 flex justify-center items-end" style={{ minHeight: 92 }}>
          {hand.map((c, i) => {
            const isLegal = legalIds.has(c.id);
            const isSel = c.id === selected;
            return (
              <div
                key={c.id}
                style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: isSel ? 100 : i, transform: isSel ? "translateY(-14px)" : undefined }}
                className="transition-transform"
                onClick={() => tapCard(c)}
              >
                <CardView card={c} small dim={myTurnToPlay && !isLegal} selected={isSel} />
              </div>
            );
          })}
        </div>
      )}

      {/* Declare overlay */}
      {showDeclare && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-2 overflow-auto">
          <DeclarePanel state={state} me={me} onDeclare={p.onDeclare} />
        </div>
      )}

      {/* Round / game end */}
      {showRoundEnd && <RoundEnd state={state} onNext={p.onRoundNext ?? p.onExit} />}
    </div>
  );
}

function rankLabel(rank: number): string {
  return rank === 14 ? "A" : rank === 13 ? "K" : rank === 12 ? "Q" : rank === 11 ? "J" : rank === 10 ? "10" : String(rank);
}
