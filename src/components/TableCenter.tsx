import { GameState, SUIT_GLYPHS } from "../game/types";

interface Props {
  state: GameState;
}

export function TableCenter({ state }: Props) {
  const r = state.round;
  if (r.phase === "round_end" || r.phase === "game_end") return null;
  const trumpRed = r.trump === "H" || r.trump === "D";
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center select-none">
      {r.phase === "bidding" && (
        <>
          <div className="font-display text-2xl text-gold-400/85 tracking-[0.35em]">BIDDING</div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-stone-400/80 mt-1">Round {r.roundNumber}</div>
        </>
      )}
      {r.phase === "declaring" && (
        <>
          <div className="font-display text-2xl text-gold-400/85 tracking-[0.35em]">DECLARING</div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-stone-400/80 mt-1">
            {state.players[r.bidder!].name} · {r.winningBid}
          </div>
        </>
      )}
      {r.phase === "playing" && r.trump && (
        <div className="flex flex-col items-center">
          <div className="text-[10px] uppercase tracking-[0.4em] text-stone-400/70">Trump</div>
          <div
            className={`text-[88px] leading-none font-bold mt-0 ${
              trumpRed ? "text-rose-400/80" : "text-stone-100/85"
            }`}
            style={{ filter: "drop-shadow(0 4px 18px rgba(0,0,0,0.4))" }}
          >
            {SUIT_GLYPHS[r.trump]}
          </div>
          <div className="text-xs mt-1 flex items-center gap-1.5">
            <span className="text-gold-400 font-semibold">{state.players[r.bidder!].name}</span>
            <span className="text-stone-500">·</span>
            <span className="font-mono text-stone-200">{r.winningBid}</span>
            {/* partner count intentionally hidden — that's part of the mystery */}
          </div>
        </div>
      )}
    </div>
  );
}
