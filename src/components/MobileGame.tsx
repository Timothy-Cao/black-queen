// Vertical, phone-first game layout. Used (in place of the desktop ellipse
// table) on narrow screens for both single-player and online games.
//
// Opponents are compact status chips (avatar · card count · points · role) with
// no fanned card-backs; the current trick sits in the middle; the local hand
// fans to fit the screen width with tap-to-select + a confirm to play.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Card, GameState, PlayerId, Suit, Rank } from "../game/types";
import { SUIT_GLYPHS, SUITS, RANK_LABEL, cardPoints } from "../game/types";
import { CardView } from "./CardView";
import { RoundEnd } from "./RoundEnd";
import { legalPlays } from "../game/rules";
import { legalBidAmount } from "../game/engine";
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
  secondsLeft?: number | null; // turn countdown (online)
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
  // Measure the hand container directly (robust to any viewport / rotation).
  const handRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState<number>(0);
  useEffect(() => {
    const el = handRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth));
    ro.observe(el);
    setContainerW(el.clientWidth);
    return () => ro.disconnect();
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

  // Fan geometry: fit all cards within the measured container width. CARD_W
  // must match CardView's small width (56px) or the fan overflows.
  const CARD_W = 56;
  const avail = (containerW > 0 ? containerW : 360) - 8;
  const step = hand.length > 1
    ? Math.max(14, Math.min(CARD_W - 4, (avail - CARD_W) / (hand.length - 1)))
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
        <div className="ml-auto flex items-center gap-2.5 text-[11px] text-stone-300 whitespace-nowrap">
          {r.winningBid != null && <span>Bid <b className="text-gold-300">{r.winningBid}</b></span>}
          {trump && (
            <span className="flex items-center gap-1">
              <span className="text-stone-500">trump</span>
              <span className={`text-base leading-none ${trump === "H" || trump === "D" ? "text-rose-400" : "text-stone-100"}`}>{SUIT_GLYPHS[trump]}</span>
            </span>
          )}
          {r.partnerCard && (
            <span className="flex items-center gap-1">
              <span className="text-stone-500">call</span>
              <span className={`font-semibold ${r.partnerCard.suit === "H" || r.partnerCard.suit === "D" ? "text-rose-300" : "text-stone-100"}`}>
                {RANK_LABEL[r.partnerCard.rank]}{SUIT_GLYPHS[r.partnerCard.suit]}
              </span>
            </span>
          )}
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
        <div className="text-center text-[11px] uppercase tracking-widest text-gold-400/90 py-1">
          {turnText}
          {p.secondsLeft != null && <span className={`ml-2 font-mono ${p.secondsLeft <= 5 ? "text-rose-400" : "text-stone-300"}`}>{p.secondsLeft}s</span>}
        </div>
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

      {/* Bidding panel (compact) */}
      {showBidPanel && <MobileBidPanel state={state} me={me} onBid={p.onBid} onPass={p.onPass} />}

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
        <div ref={handRef} className="w-full pb-2 pt-1 flex justify-center items-end" style={{ minHeight: 92 }}>
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

      {/* Declare overlay (compact, two-step) */}
      {showDeclare && <MobileDeclarePanel state={state} me={me} onDeclare={p.onDeclare} />}

      {/* Round / game end */}
      {showRoundEnd && <RoundEnd state={state} onNext={p.onRoundNext ?? p.onExit} />}
    </div>
  );
}

function rankLabel(rank: number): string {
  return rank === 14 ? "A" : rank === 13 ? "K" : rank === 12 ? "Q" : rank === 11 ? "J" : rank === 10 ? "10" : String(rank);
}

// ── Compact mobile bidding panel ───────────────────────────────────────────
function MobileBidPanel({ state, me, onBid, onPass }: {
  state: GameState; me: PlayerId; onBid: (n: number) => void; onPass: () => void;
}) {
  const r = state.round;
  const { min, max } = legalBidAmount(r);
  const isMyTurn = r.bidTurn === me;
  const highest = Math.max(0, ...r.bids.map((b) => b.amount));
  const last = r.bids[r.bids.length - 1];
  const lastBidder = highest > 0 && last ? state.players[last.player].name : null;
  const opts = [min, min + 5, min + 10, min + 15].filter((v) => v <= max).filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div className="px-3 pb-2">
      <div className="glass rounded-xl px-3 py-2.5">
        <div className="text-[11px] text-center text-stone-300 mb-2">
          {highest > 0
            ? <>Highest <b className="text-gold-300">{highest}</b>{lastBidder ? ` by ${lastBidder}` : ""}</>
            : <>No bids yet · opens at {min}</>}
        </div>
        {isMyTurn ? (
          <div className="flex gap-1.5 justify-center flex-wrap">
            <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={() => { sfx.uiClick(); onPass(); }}>Pass</button>
            {opts.map((v) => (
              <button key={v} className="btn btn-primary px-3 py-1.5 text-sm font-bold" onClick={() => { sfx.uiClick(); onBid(v); }}>{v}</button>
            ))}
          </div>
        ) : (
          <div className="text-xs text-stone-400 italic text-center">Waiting on {state.players[r.bidTurn ?? me]?.name}…</div>
        )}
      </div>
    </div>
  );
}

// ── Compact mobile declare sheet (trump → partner suit → partner rank) ──────
const DECLARE_RANKS: Rank[] = [14, 13, 12, 11, 10, 9, 8, 7, 5];

function MobileDeclarePanel({ state, me, onDeclare }: {
  state: GameState; me: PlayerId; onDeclare: (trump: Suit, partnerCard: Card) => void;
}) {
  const [trump, setTrump] = useState<Suit | undefined>();
  const [pSuit, setPSuit] = useState<Suit | undefined>();
  const [pRank, setPRank] = useState<Rank | undefined>();
  const hand = state.players[me].hand;
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of hand) m[`${c.suit}${c.rank}`] = (m[`${c.suit}${c.rank}`] || 0) + 1;
    return m;
  }, [hand]);
  const totalCopies = (s: Suit, r: Rank) => (s === "S" && r === 7 ? 1 : 2);
  const ownsAll = (s: Suit, r: Rank) => (counts[`${s}${r}`] || 0) >= totalCopies(s, r);
  const ranksFor = (s: Suit) => DECLARE_RANKS.filter((r) => r !== 7 || s === "S");
  const can = trump && pSuit && pRank && !ownsAll(pSuit, pRank);

  const SuitBtn = ({ s, active, onClick }: { s: Suit; active: boolean; onClick: () => void }) => {
    const red = s === "H" || s === "D";
    return (
      <button
        onClick={() => { sfx.uiClick(); onClick(); }}
        className={`text-2xl w-14 h-12 rounded-lg border transition ${active ? "bg-gold-500 text-stone-900 border-gold-500" : `bg-white/5 border-white/10 ${red ? "text-rose-300" : "text-stone-100"}`}`}
      >{SUIT_GLYPHS[s]}</button>
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0c1f18] p-4 overflow-auto">
      <div className="text-xs uppercase tracking-widest text-gold-400">Declare</div>
      <div className="text-sm text-stone-200 mt-1 mb-4">
        You won at <b className="text-gold-400">{state.round.winningBid}</b>. Pick trump and call a partner card.
      </div>

      <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1.5">Trump suit</div>
      <div className="flex gap-2 mb-5">{SUITS.map((s) => <SuitBtn key={s} s={s} active={trump === s} onClick={() => setTrump(s)} />)}</div>

      <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1.5">Partner card · suit</div>
      <div className="flex gap-2 mb-5">{SUITS.map((s) => <SuitBtn key={s} s={s} active={pSuit === s} onClick={() => { setPSuit(s); setPRank(undefined); }} />)}</div>

      {pSuit && (
        <>
          <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1.5">Partner card · rank <span className="text-stone-600">(dimmed = you own all copies)</span></div>
          <div className="flex gap-1.5 flex-wrap mb-5">
            {ranksFor(pSuit).map((r) => {
              const blocked = ownsAll(pSuit, r);
              const sel = pRank === r;
              return (
                <button
                  key={r}
                  disabled={blocked}
                  onClick={() => { sfx.uiClick(); setPRank(r); }}
                  className={`w-9 h-11 rounded-md text-sm transition ${sel ? "bg-gold-500 text-stone-900 font-bold" : blocked ? "bg-white/5 text-stone-600 border border-rose-700/30" : "bg-white/5 text-stone-200 border border-white/10"}`}
                >{RANK_LABEL[r]}</button>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-auto pt-3">
        <button
          className="btn btn-primary w-full py-3"
          disabled={!can}
          onClick={() => { if (can && trump && pSuit && pRank) { sfx.uiClick(); onDeclare(trump, { suit: pSuit, rank: pRank, id: `${pSuit}${pRank}_0` }); } }}
        >
          {can && pSuit && pRank ? `Declare ${RANK_LABEL[pRank]}${SUIT_GLYPHS[pSuit]} · trump ${SUIT_GLYPHS[trump!]}` : "Pick trump + partner card"}
        </button>
      </div>
    </div>
  );
}
