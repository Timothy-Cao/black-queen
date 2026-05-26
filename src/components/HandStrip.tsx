import { useMemo, useState } from "react";
import { Card, GameState, PlayerId, SUIT_GLYPHS } from "../game/types";
import { legalPlays } from "../game/rules";
import { CardView } from "./CardView";

interface Props {
  state: GameState;
  me: PlayerId;
  onPlay: (c: Card) => void;
}

type SortMode = "suit" | "rank";

export function HandStrip({ state, me, onPlay }: Props) {
  const r = state.round;
  const hand = state.players[me].hand;
  const [sortMode, setSortMode] = useState<SortMode>("suit");
  const myTurn = r.phase === "playing" && r.toPlay === me && !r.pendingTrickComplete;
  const legal = myTurn ? legalPlays(hand, r.currentTrick) : [];
  const legalIds = new Set(legal.map((c) => c.id));
  const partnerCard = r.partnerCard;
  const matchesPartner = (c: { suit: string; rank: number }) =>
    !!partnerCard && c.suit === partnerCard.suit && c.rank === partnerCard.rank;
  const iAmBidder = me === r.bidder;
  const iHavePartnerCard = !!partnerCard && hand.some(matchesPartner);
  const showPartnerHint = !!partnerCard && (iAmBidder || iHavePartnerCard);
  const trump = r.trump;

  const sorted = useMemo(() => {
    const order: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 };
    // Trump first
    const trumpOrder = (s: string) => (s === trump ? -1 : order[s] ?? 9);
    if (sortMode === "rank") {
      return hand.slice().sort((a, b) => b.rank - a.rank || trumpOrder(a.suit) - trumpOrder(b.suit));
    }
    return hand.slice().sort((a, b) => trumpOrder(a.suit) - trumpOrder(b.suit) || b.rank - a.rank);
  }, [hand, sortMode, trump]);

  // For up to ~13 cards, choose an overlap that lets the rank/suit corner stay readable.
  const overlap = sorted.length >= 12 ? 36 : sorted.length >= 10 ? 32 : 28;
  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-3 flex flex-col items-center pointer-events-auto z-30">
      <div className="flex">
        {sorted.map((c, i) => {
          const isLegal = legalIds.has(c.id);
          const isPartnerCard = showPartnerHint && matchesPartner(c);
          return (
            <div
              key={c.id}
              style={{
                marginLeft: i === 0 ? 0 : -overlap,
                zIndex: i,
              }}
              className="transition-transform hover:z-50"
            >
              <CardView
                card={c}
                disabled={!myTurn || !isLegal}
                onClick={() => isLegal && onPlay(c)}
                highlight={isPartnerCard && r.phase === "playing"}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1 text-[10px] text-stone-400">
        <span className="opacity-70">sort:</span>
        <button
          className={`px-1.5 py-0.5 rounded ${sortMode === "suit" ? "bg-gold-500/20 text-gold-400" : "hover:bg-white/5"}`}
          onClick={() => setSortMode("suit")}
        >
          by suit
        </button>
        <button
          className={`px-1.5 py-0.5 rounded ${sortMode === "rank" ? "bg-gold-500/20 text-gold-400" : "hover:bg-white/5"}`}
          onClick={() => setSortMode("rank")}
        >
          by rank
        </button>
        {trump && (
          <span className="ml-2 opacity-70">trump <span className={trump==="H"||trump==="D"?"text-rose-400":"text-stone-200"}>{SUIT_GLYPHS[trump]}</span> first</span>
        )}
      </div>
    </div>
  );
}
