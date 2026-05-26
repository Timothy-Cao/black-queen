import { useState } from "react";
import { Player, cardPoints, RANK_LABEL, SUIT_GLYPHS, SUIT_RED } from "../game/types";

interface Props {
  player: Player;
  position: "bottom" | "left" | "topLeft" | "topRight" | "right";
}

const POS: Record<Props["position"], React.CSSProperties> = {
  bottom:   { right: "30%", bottom: "12px" },
  left:     { left: "calc(1.5% + 110px)", top: "42%", transform: "translateY(-50%)" },
  topLeft:  { left: "calc(18% + 110px)", top: "14px" },
  topRight: { right: "calc(18% + 110px)", top: "14px" },
  right:    { right: "calc(1.5% + 110px)", top: "42%", transform: "translateY(-50%)" },
};

const W = 44;
const H = 60;

export function CollectionDeck({ player, position }: Props) {
  const [hover, setHover] = useState(false);
  const captured = player.tricksWon;
  if (captured.length === 0) return null;
  const pts = captured.reduce((s, c) => s + cardPoints(c), 0);
  const topCard = captured[captured.length - 1];

  return (
    <div
      className="absolute z-20"
      style={POS[position]}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Two thin slivers behind to indicate it's a stack, then the top card on top */}
      <div className="relative" style={{ width: W, height: H }}>
        <div
          className="absolute rounded-md bg-stone-200/80 border border-stone-400/60"
          style={{ width: W, height: H, top: 3, left: 3 }}
        />
        <div
          className="absolute rounded-md bg-stone-100/95 border border-stone-400/70"
          style={{ width: W, height: H, top: 1.5, left: 1.5 }}
        />
        <div
          className="absolute card-face shadow-card flex items-center justify-center text-sm font-bold"
          style={{
            width: W, height: H, top: 0, left: 0,
            color: SUIT_RED[topCard.suit]
              ? topCard.suit === "H" ? "#c4222e" : "#e5701a"
              : topCard.suit === "S" ? "#1a1714" : "#2a3b22",
          }}
        >
          <div className="flex flex-col items-center leading-none">
            <span>{RANK_LABEL[topCard.rank]}</span>
            <span className="text-base mt-0.5">{SUIT_GLYPHS[topCard.suit]}</span>
          </div>
        </div>
        {pts > 0 && (
          <div
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[10px] px-1.5 py-0.5 rounded-full bg-gold-500/90 text-stone-900 font-bold whitespace-nowrap shadow"
          >
            {pts}
          </div>
        )}
      </div>
      {hover && <CollectionPopup player={player} position={position} />}
    </div>
  );
}

function CollectionPopup({ player, position }: { player: Player; position: Props["position"] }) {
  const cards = player.tricksWon.slice().sort((a, b) => {
    const order: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 };
    if (a.suit !== b.suit) return order[a.suit] - order[b.suit];
    return b.rank - a.rank;
  });
  const totalPts = cards.reduce((s, c) => s + cardPoints(c), 0);
  const isPoint = (rank: number, suit: string) =>
    rank === 14 || rank === 10 || rank === 5 || (rank === 12 && suit === "S");
  const tricksCount = Math.floor(cards.length / 5);

  const popupAnchor: React.CSSProperties = position === "left"
    ? { left: 50, top: 0 }
    : position === "right"
    ? { right: 50, top: 0 }
    : position === "topLeft" || position === "topRight"
    ? { top: 70, left: 0 }
    : { bottom: 70, right: 0 };

  return (
    <div
      className="absolute glass rounded-xl p-3 shadow-2xl w-[280px] z-50 animate-floatIn"
      style={popupAnchor}
    >
      <div className="text-xs uppercase tracking-widest text-gold-400 mb-1">
        {player.name}'s collection
      </div>
      <div className="text-[11px] text-stone-400 mb-2">
        {tricksCount} trick{tricksCount === 1 ? "" : "s"} · {cards.length} cards · {totalPts} pts
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
