import { Player, cardPoints } from "../game/types";
import { CardView } from "./CardView";

export type SeatPosition = "bottom" | "left" | "topLeft" | "topRight" | "right";

// Calmer, more refined palette — deep jewel tones instead of saturated primaries.
const AVATAR_COLORS = ["#5b4eb6", "#3a7a8a", "#5a7b3c", "#a14552", "#b87333"];
function avatarColor(id: number) { return AVATAR_COLORS[id % AVATAR_COLORS.length]; }

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
  bottom: { left: "50%", bottom: "8px", transform: "translateX(-50%)" },
  left: { left: "1.5%", top: "42%", transform: "translateY(-50%)" },
  topLeft: { left: "18%", top: "10px" },
  topRight: { right: "18%", top: "10px" },
  right: { right: "1.5%", top: "42%", transform: "translateY(-50%)" },
};

const MAX_VISIBLE_BACKS = 5;

export function PlayerSeat({
  player, isActive, isBidder, isPartner, isDealer, showHand, isMe, position, bidLabel,
}: Props) {
  const isBottom = position === "bottom";
  const cardCount = player.hand.length;
  const capturedPts = player.tricksWon.reduce((s, c) => s + cardPoints(c), 0);
  const visibleBacks = Math.min(MAX_VISIBLE_BACKS, cardCount);
  const overflow = cardCount - visibleBacks;
  return (
    <div className="absolute z-10" style={POS_STYLE[position]}>
      <div className={`flex ${isBottom ? "flex-col-reverse items-center" : "flex-col items-center"} gap-1.5`}>
        <div
          className={`glass rounded-xl px-2.5 py-1.5 flex items-center gap-2 whitespace-nowrap ${
            isActive ? "ring-2 ring-gold-400 animate-pulseGlow" : ""
          }`}
        >
          <div className="relative">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs"
              style={{
                background: player.isAI ? avatarColor(player.id) : "#e0a93a",
                color: player.isAI ? "#fafafa" : "#1c1917",
              }}
              title={player.isAI ? `AI · ${player.name}` : "Human"}
            >
              {(player.name[0] || "P").toUpperCase()}
            </div>
            {isDealer && (
              <div
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-stone-100 text-stone-900 text-[9px] font-bold flex items-center justify-center shadow"
                title="Dealer"
              >
                D
              </div>
            )}
          </div>
          <div className="flex flex-col leading-tight">
            <div className="font-semibold text-sm text-stone-100 flex items-center">
              {player.name}
              {isBidder && <span className="ml-1 text-gold-400" title="Bidder">★</span>}
              {isPartner && <span className="ml-1 text-amber-300" title="Revealed partner">◆</span>}
            </div>
            {/* For other players we still show their cumulative score; the bottom (own) seat
                gets only the name — the player's own score lives in the sidebar and the
                collection deck shows their captured points. */}
            {!isMe && (
              <div className="text-[10px] text-stone-300 uppercase tracking-wider">
                Score {player.scoreTotal}
              </div>
            )}
          </div>
          {bidLabel && (
            <div className="ml-1 text-[11px] px-1.5 py-0.5 rounded bg-gold-500/20 text-gold-400 font-semibold">
              {bidLabel}
            </div>
          )}
        </div>
        {!isMe && (
          <div className="flex items-center">
            {showHand && player.hand.length > 0 ? (
              player.hand.slice(0, 8).map((c, i) => (
                <div key={c.id} style={{ marginLeft: i === 0 ? 0 : -22 }}>
                  <CardView card={c} small />
                </div>
              ))
            ) : (
              <>
                {Array.from({ length: visibleBacks }).map((_, i) => (
                  <div key={`back-${player.id}-${i}`} style={{ marginLeft: i === 0 ? 0 : -26 }}>
                    <CardView faceDown small />
                  </div>
                ))}
                {overflow > 0 && (
                  <div
                    className="ml-1 text-[10px] text-stone-300 bg-black/40 px-1.5 py-0.5 rounded-full border border-white/10"
                    title={`${cardCount} cards in hand`}
                  >
                    +{overflow}
                  </div>
                )}
                {cardCount === 0 && (
                  <div className="text-[10px] text-stone-500 italic">empty</div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
