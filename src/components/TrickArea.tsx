import { GameState, PlayerId } from "../game/types";
import { CardView } from "./CardView";

interface Props {
  state: GameState;
  seatPosition: Record<PlayerId, "bottom" | "left" | "topLeft" | "topRight" | "right">;
}

// Cards sit in a tight ring around the felt center, well clear of seats, collection decks,
// the hand strip, and the trump glyph in the middle.
// Each entry: offset (px) from felt center, plus a small rotation for natural fan.
const PLAY: Record<string, { dx: number; dy: number; rot: number }> = {
  bottom:   { dx:    0, dy:  150, rot:   0 },
  left:     { dx: -180, dy:   10, rot:  -8 },
  topLeft:  { dx: -120, dy: -120, rot:   4 },
  topRight: { dx:  120, dy: -120, rot:  -4 },
  right:    { dx:  180, dy:   10, rot:   8 },
};

// Where each card "slides from" (pixels relative to its final position).
const SLIDE_FROM: Record<string, { x: number; y: number }> = {
  bottom:   { x:    0, y:  220 },
  left:     { x: -240, y:    0 },
  topLeft:  { x: -180, y: -180 },
  topRight: { x:  180, y: -180 },
  right:    { x:  240, y:    0 },
};

export function TrickArea({ state, seatPosition }: Props) {
  const trick = state.round.currentTrick;
  const r = state.round;
  if (!trick || trick.plays.length === 0) return null;
  return (
    <>
      {trick.plays.map((tp) => {
        const pos = seatPosition[tp.player];
        const p = PLAY[pos];
        const origin = SLIDE_FROM[pos];
        const isWinner = r.pendingTrickComplete && trick.winner === tp.player;
        return (
          <div
            key={`play-${tp.player}-${tp.card.id}`}
            className="absolute pointer-events-none"
            style={{
              left: "50%",
              top: "50%",
              // Final position: shift to card center, then offset by (dx, dy) from felt center.
              transform: `translate(calc(-50% + ${p.dx}px), calc(-50% + ${p.dy}px)) rotate(${p.rot}deg)`,
              transition: "filter 0.3s",
              filter: r.pendingTrickComplete && !isWinner ? "brightness(0.55)" : "none",
              zIndex: isWinner ? 5 : 2,
            }}
          >
            <div
              style={{
                animation: "slideToCenter 360ms cubic-bezier(0.2, 0.7, 0.2, 1) both",
                ["--from-x" as any]: `${origin.x}px`,
                ["--from-y" as any]: `${origin.y}px`,
              }}
            >
              <CardView card={tp.card} highlight={isWinner} />
            </div>
          </div>
        );
      })}
      {r.pendingTrickComplete && trick.winner !== undefined && (
        <div
          className="absolute left-1/2 top-1/2 text-sm font-semibold text-gold-400 bg-black/75 px-3 py-1.5 rounded-full animate-floatIn whitespace-nowrap shadow-lg border border-gold-400/30 z-10 pointer-events-none"
          style={{ transform: "translate(-50%, calc(-50% + 250px))" }}
        >
          {state.players[trick.winner].name} wins · +{trick.points}
        </div>
      )}
    </>
  );
}
