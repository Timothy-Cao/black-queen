import { GameState, PlayerId } from "../game/types";
import { legalBidAmount } from "../game/engine";

interface Props {
  state: GameState;
  me: PlayerId;
  onBid: (amount: number) => void;
  onPass: () => void;
}

export function BiddingPanel({ state, me, onBid, onPass }: Props) {
  const r = state.round;
  const { min, max } = legalBidAmount(r);
  const isMyTurn = r.bidTurn === me;
  const highest = Math.max(0, ...r.bids.map((b) => b.amount));
  const lastBidder = highest > 0 ? state.players[r.bids[r.bids.length - 1].player].name : null;

  // Clean 2×2 grid of bid options. +5 is the legal minimum bump.
  const opts = [
    { label: "+5",  amount: min },
    { label: "+10", amount: Math.min(max, min + 5) },
    { label: "+15", amount: Math.min(max, min + 10) },
    { label: "+20", amount: Math.min(max, min + 15) },
  ];

  return (
    <div className={`glass rounded-xl p-4 w-72 animate-floatIn shadow-lg ${isMyTurn ? "bid-glow" : ""}`}>
      <div className="flex items-baseline justify-between mb-2">
        {isMyTurn ? (
          <div className="text-xs uppercase tracking-widest text-gold-300 font-bold flex items-center gap-1.5">
            <span className="bid-dot inline-block w-2 h-2 rounded-full bg-gold-400" />
            Your bid
          </div>
        ) : (
          <div className="text-xs uppercase tracking-widest text-gold-400">Bidding</div>
        )}
        <div className="text-[10px] uppercase tracking-wider text-stone-500">Round {r.roundNumber}</div>
      </div>
      <div className="text-sm text-stone-200 mb-3">
        {highest > 0 ? (
          <>
            <span className="text-stone-400">Highest </span>
            <span className="font-bold text-gold-400">{highest}</span>
            <span className="text-stone-400"> by {lastBidder}</span>
          </>
        ) : (
          <span className="text-stone-400 italic">No bids yet. Opening at {min}</span>
        )}
      </div>

      {isMyTurn ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn btn-ghost text-sm py-2 col-span-2"
              onClick={onPass}
            >
              Pass
            </button>
            {opts.map((o) =>
              o.amount > max ? null : (
                <button
                  key={o.label}
                  className="btn btn-primary py-2 flex flex-col items-center"
                  onClick={() => onBid(o.amount)}
                  title={`Bid ${o.amount}`}
                >
                  <span className="text-[10px] uppercase tracking-wider opacity-75">{o.label}</span>
                  <span className="text-lg font-bold leading-none">{o.amount}</span>
                </button>
              ),
            )}
          </div>
          <div className="text-[11px] text-stone-500 text-center mt-2">
            Range {min}–{max}
          </div>
        </>
      ) : (
        <div className="text-sm text-stone-300 italic">
          Waiting on <span className="text-gold-400 font-semibold not-italic">{state.players[r.bidTurn ?? me].name}</span>...
        </div>
      )}

      <div className="mt-3 text-xs space-y-0.5 max-h-32 overflow-auto pr-1 border-t border-white/5 pt-2">
        {r.bids.length === 0 && [...r.passed].length === 0 && (
          <div className="text-stone-500 italic">No moves yet</div>
        )}
        {[
          ...r.bids.map((b, i) => ({ key: `b${i}`, player: b.player, label: `${b.amount}`, color: "text-gold-400" })),
          ...[...r.passed].map((p) => ({ key: `p${p}`, player: p, label: "pass", color: "text-stone-500" })),
        ].slice(-10).map((row) => (
          <div key={row.key} className="text-stone-300 flex justify-between">
            <span>{state.players[row.player].name}</span>
            <span className={row.color}>{row.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
