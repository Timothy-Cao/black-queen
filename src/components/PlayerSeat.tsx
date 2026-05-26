import { Player, cardPoints, RANK_LABEL, SUIT_GLYPHS, SUIT_RED, PlayerId } from "../game/types";
import { useState } from "react";
import { CardView } from "./CardView";

export type SeatPosition = "bottom" | "left" | "topLeft" | "topRight" | "right";

// Calmer, more refined palette — deep jewel tones instead of saturated primaries.
const AVATAR_COLORS = ["#5b4eb6", "#3a7a8a", "#5a7b3c", "#a14552", "#b87333"];
function avatarColor(id: number) { return AVATAR_COLORS[id % AVATAR_COLORS.length]; }

// Cute emoji faces per player slot.
const AVATAR_EMOJI = ["🦊", "🐱", "🐻", "🐼", "🐶"];
function avatarEmoji(id: number) { return AVATAR_EMOJI[id % AVATAR_EMOJI.length]; }

interface Props {
  player: Player;
  isActive?: boolean;
  isBidder?: boolean;
  isPartner?: boolean;
  isDealer?: boolean;
  showHand?: boolean;
  isMe?: boolean;
  position: SeatPosition;
  bidLabel?: string;
}

const POS_STYLE: Record<SeatPosition, React.CSSProperties> = {
  bottom:   { left: "50%", top: "90%", transform: "translate(-50%, -50%)" },
  left:     { left: "10%", top: "65%", transform: "translate(-50%, -50%)" },
  topLeft:  { left: "25%", top: "15%", transform: "translate(-50%, -50%)" },
  topRight: { right: "25%", top: "15%", transform: "translate(50%, -50%)" },
  right:    { right: "10%", top: "65%", transform: "translate(50%, -50%)" },
};

const MAX_VISIBLE_BACKS = 5;
const NAME_HEIGHT = 56; // matches collection deck height
const DECK_W = 40;
const DECK_H = NAME_HEIGHT;

export function PlayerSeat({
  player, isActive, isBidder, isPartner, isDealer, showHand, isMe, position, bidLabel,
}: Props) {
  const isBottom = position === "bottom";
  const cardCount = player.hand.length;
  const visibleBacks = Math.min(MAX_VISIBLE_BACKS, cardCount);
  const overflow = cardCount - visibleBacks;
  const capturedPts = player.tricksWon.reduce((s, c) => s + cardPoints(c), 0);
  const topCard = player.tricksWon.length > 0 ? player.tricksWon[player.tricksWon.length - 1] : undefined;
  const [collectionHover, setCollectionHover] = useState(false);

  return (
    <div className={`absolute ${collectionHover ? "z-50" : "z-20"}`} style={POS_STYLE[position]}>
      <div className={`flex ${isBottom ? "flex-col-reverse items-center" : "flex-col items-center"} gap-2`}>
        <div className="flex items-stretch gap-0">
          {/* Collection deck attached to the LEFT of the name pill */}
          <SeatCollection
            player={player}
            topCard={topCard}
            capturedPts={capturedPts}
            width={DECK_W}
            height={DECK_H}
            onHoverChange={setCollectionHover}
          />
          {/* Name pill — height matched to the collection deck so they look attached.
              When this player is the round's dealer (and thus starts the round) we
              tint the pill with a warm amber accent so it's instantly readable. */}
          <div
            className={`glass rounded-r-xl ${capturedPts === 0 && player.tricksWon.length === 0 ? "rounded-l-xl" : ""} px-3 flex items-center gap-2.5 whitespace-nowrap ${
              isActive ? "ring-2 ring-gold-400 animate-pulseGlow" : ""
            } ${
              isDealer && !isActive ? "ring-1 ring-amber-300/45 shadow-[0_0_18px_rgba(245,196,107,0.18)]" : ""
            }`}
            style={{ height: NAME_HEIGHT, ...(isDealer && !isActive ? { background: "linear-gradient(180deg, rgba(245,196,107,0.10), rgba(10,30,22,0.65))" } : {}) }}
          >
            <div className="relative">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-2xl leading-none"
                style={{
                  background: player.isAI ? avatarColor(player.id) : "#e0a93a",
                  boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.12)",
                }}
                title={player.isAI ? `AI · ${player.name}` : "Human"}
              >
                <span style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.4))" }}>
                  {avatarEmoji(player.id)}
                </span>
              </div>
              {/* Dealer is signaled by the amber accent on the name pill. */}
            </div>
            <div className="flex flex-col leading-tight">
              <div className="font-semibold text-base text-stone-100 flex items-center">
                {player.name}
                {isBidder && <span className="ml-1 text-gold-400" title="Caller">★</span>}
                {isPartner && <span className="ml-1 text-amber-300" title="Revealed partner">◆</span>}
              </div>
              {!isMe && (
                <div className="text-[11px] text-stone-300/90 uppercase tracking-wider">
                  {player.isAI
                    ? `AI · ${
                        player.aiPersonality === "random" ? "Random"
                        : player.aiPersonality === "hard" ? "Hard"
                        : player.aiPersonality === "hard-2" ? "Hard-2"
                        : player.aiPersonality === "hard-3" ? "Hard-3"
                        : "Normal"
                      }`
                    : "Human"}
                </div>
              )}
            </div>
            {bidLabel && (
              <div className="ml-1 text-[12px] px-1.5 py-0.5 rounded bg-gold-500/20 text-gold-400 font-semibold">
                {bidLabel}
              </div>
            )}
          </div>
        </div>
        {!isMe && (
          <div className="flex items-center">
            {showHand && player.hand.length > 0 ? (
              player.hand.slice(0, 8).map((c, i) => (
                <div key={c.id} style={{ marginLeft: i === 0 ? 0 : -28 }}>
                  <CardView card={c} small />
                </div>
              ))
            ) : (
              <>
                {Array.from({ length: visibleBacks }).map((_, i) => (
                  <div key={`back-${player.id}-${i}`} style={{ marginLeft: i === 0 ? 0 : -34 }}>
                    <CardView faceDown small />
                  </div>
                ))}
                {overflow > 0 && (
                  <div
                    className="ml-2 text-[11px] text-stone-300 bg-black/40 px-1.5 py-0.5 rounded-full border border-white/10"
                    title={`${cardCount} cards in hand`}
                  >
                    +{overflow}
                  </div>
                )}
                {cardCount === 0 && (
                  <div className="text-[11px] text-stone-500 italic">empty</div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SeatCollection: small face-up collection pile attached to the left of the
// name pill. Two thin slivers behind to suggest a stack, then the latest
// captured card on top. Hovering shows the full captured list popup.
// -----------------------------------------------------------------------------

interface SeatCollectionProps {
  player: Player;
  topCard?: { suit: string; rank: number };
  capturedPts: number;
  width: number;
  height: number;
  onHoverChange?: (h: boolean) => void;
}

function SeatCollection({ player, topCard, capturedPts, width, height, onHoverChange }: SeatCollectionProps) {
  const [hover, _setHover] = useState(false);
  const setHover = (h: boolean) => { _setHover(h); onHoverChange?.(h); };
  // If nothing captured yet, render a placeholder slot so the name pill stays
  // attached to a consistent left edge.
  if (!topCard) {
    return (
      <div
        className="glass rounded-l-xl border-r-0 flex items-center justify-center"
        style={{ width, height }}
      >
        <span className="text-stone-500 text-[10px]">—</span>
      </div>
    );
  }
  const suit = topCard.suit;
  const rank = topCard.rank;
  const color = SUIT_RED[suit as "S"|"H"|"D"|"C"]
    ? suit === "H" ? "#c4222e" : "#e5701a"
    : suit === "S" ? "#1a1714" : "#2a3b22";
  return (
    <div
      className="relative"
      style={{ width, height }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* sliver behind */}
      <div
        className="absolute rounded-md bg-stone-200/80 border border-stone-400/60"
        style={{ width: width - 4, height: height - 6, top: 6, left: 4 }}
      />
      <div
        className="absolute rounded-md bg-stone-100/95 border border-stone-400/70"
        style={{ width: width - 2, height: height - 3, top: 3, left: 2 }}
      />
      <div
        className="absolute card-face shadow-card flex items-center justify-center font-bold"
        style={{ width, height, top: 0, left: 0, color, fontSize: 14, borderRadius: 8 }}
      >
        <div className="flex flex-col items-center leading-none">
          <span>{RANK_LABEL[rank as 2|3|4|5|6|7|8|9|10|11|12|13|14]}</span>
          <span className="text-base mt-0.5">{SUIT_GLYPHS[suit as "S"|"H"|"D"|"C"]}</span>
        </div>
      </div>
      {capturedPts > 0 && (
        <div className="absolute -top-1 -right-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gold-500/95 text-stone-900 font-bold whitespace-nowrap shadow">
          {capturedPts}
        </div>
      )}
      {hover && <CollectionPopup player={player} />}
    </div>
  );
}

function CollectionPopup({ player }: { player: Player }) {
  const cards = player.tricksWon.slice().sort((a, b) => {
    const order: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 };
    if (a.suit !== b.suit) return order[a.suit] - order[b.suit];
    return b.rank - a.rank;
  });
  const totalPts = cards.reduce((s, c) => s + cardPoints(c), 0);
  const isPoint = (rank: number, suit: string) =>
    rank === 14 || rank === 10 || rank === 5 || (rank === 12 && suit === "S");
  const tricksCount = Math.floor(cards.length / 5);
  return (
    <div className="absolute glass rounded-xl p-3 shadow-2xl w-[280px] z-50 animate-floatIn"
         style={{ top: "calc(100% + 8px)", left: 0 }}>
      <div className="text-xs uppercase tracking-widest text-gold-400 mb-1">
        {player.name}'s collection
      </div>
      <div className="text-[11px] text-stone-400 mb-2">
        {tricksCount} round{tricksCount === 1 ? "" : "s"} · {cards.length} cards · {totalPts} pts
      </div>
      <div className="flex flex-wrap gap-1">
        {cards.map((c, i) => {
          const point = isPoint(c.rank, c.suit);
          const red = SUIT_RED[c.suit];
          return (
            <div
              key={`${c.id}-${i}`}
              className={`text-xs px-1.5 py-1 rounded font-mono ${
                point ? "bg-gold-500/25 ring-1 ring-gold-400/60" : "bg-white/5"
              }`}
              style={{
                color: red
                  ? c.suit === "H" ? "#fca5a5" : "#fdba74"
                  : c.suit === "S" ? "#e7e5e4" : "#bef264",
              }}
              title={point ? `Point card (${cardPoints(c)} pts)` : "0 pts"}
            >
              {RANK_LABEL[c.rank]}{SUIT_GLYPHS[c.suit]}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Re-export for App.tsx (kept as a sanity passthrough so existing import sites still work).
// Note: PlayerId is used only for the type signature of this passthrough.
export type _PlayerIdMarker = PlayerId;
