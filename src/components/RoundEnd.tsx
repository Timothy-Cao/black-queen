import { useState } from "react";
import { GameState, SUIT_GLYPHS, PlayerId, cardPoints } from "../game/types";
import { CardView } from "./CardView";

interface Props {
  state: GameState;
  onNext: () => void;
  onHide?: () => void;
}

export function RoundEnd({ state, onNext, onHide }: Props) {
  const [showTricks, setShowTricks] = useState(false);
  const r = state.round;
  const caller = state.players[r.bidder!];
  const partners = (r.partners ?? []).map((id) => state.players[id]);
  const teamIds = new Set<PlayerId>([r.bidder!, ...(r.partners ?? [])]);
  const teamPts = ([0, 1, 2, 3, 4] as PlayerId[])
    .filter((p) => teamIds.has(p))
    .reduce<number>((s, p) => s + (r.roundPoints?.[p] ?? 0), 0);
  const made = teamPts >= (r.winningBid ?? 0);
  const teamLabel = [caller, ...partners].map((p) => p.name).join(" + ");

  // Did any partner play their card twice (held both copies)?
  const partnerPlayCounts = new Map<PlayerId, number>();
  if (r.partnerCard) {
    for (const t of r.tricks) {
      for (const p of t.plays) {
        if (p.card.suit === r.partnerCard.suit && p.card.rank === r.partnerCard.rank) {
          partnerPlayCounts.set(p.player, (partnerPlayCounts.get(p.player) ?? 0) + 1);
        }
      }
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-30 bg-black/60 backdrop-blur-sm">
      <div className="glass rounded-2xl p-8 w-[680px] max-h-[90vh] overflow-auto animate-floatIn relative ring-2 ring-gold-400/60 shadow-[0_0_60px_rgba(245,196,107,0.3)]">
        {onHide && (
          <button
            className="absolute top-3 right-3 btn btn-ghost text-[11px]"
            onClick={onHide}
            title="Peek at the board / log"
          >
            Hide
          </button>
        )}
        <div className="text-xs uppercase tracking-widest text-gold-400">Game complete</div>
        <h2 className="font-display text-3xl mt-1">
          <span className={made ? "text-emerald-300" : "text-rose-300"}>
            {teamLabel}
          </span>
          {" "}{made ? "made the bid." : "fell short."}
        </h2>
        <div className="mt-3 text-sm text-stone-300">
          Bid <span className="font-semibold">{r.winningBid}</span>
          {" · "}Trump <span className={r.trump==="H"||r.trump==="D"?"text-rose-400":"text-stone-100"}>{r.trump && SUIT_GLYPHS[r.trump]}</span>
          {" · "}Captured <span className={made ? "text-emerald-300" : "text-rose-300"}>{teamPts}</span>
        </div>
        <table className="w-full mt-4 text-sm">
          <thead><tr className="text-stone-400 text-xs uppercase border-b border-white/10">
            <th className="text-left py-1">Player</th>
            <th className="text-right">Claimed</th>
            <th className="text-right">Δ</th>
          </tr></thead>
          <tbody>
            {/* Caller first, then partners, then opponents */}
            {[
              ...state.players.filter(p => p.id === r.bidder),
              ...state.players.filter(p => p.id !== r.bidder && (r.partners ?? []).includes(p.id)),
              ...state.players.filter(p => p.id !== r.bidder && !(r.partners ?? []).includes(p.id)),
            ].map((p) => {
              const onTeam = teamIds.has(p.id);
              const isCaller = p.id === r.bidder;
              const isPartner = (r.partners ?? []).includes(p.id);
              const playCount = partnerPlayCounts.get(p.id) ?? 0;
              const isDouble = isPartner && playCount >= 2;
              const captured = p.tricksWon.reduce((s, c) => s + cardPoints(c), 0);
              const delta = r.deltaScores?.[p.id] ?? 0;
              return (
                <tr key={p.id} className={`border-b border-white/5 last:border-0 ${onTeam ? "text-gold-400" : ""}`}>
                  <td className="py-1">
                    {p.name}
                    {isCaller && <span className="ml-1" title="Caller">★</span>}
                    {isPartner && <span className="ml-1" title="Revealed partner">◆</span>}
                    {isDouble && (
                      <span className="ml-1 text-[10px] px-1 rounded bg-amber-400/25 text-amber-300 font-bold align-middle">×2</span>
                    )}
                  </td>
                  <td className="text-right font-mono">{captured}</td>
                  <td className={`text-right font-mono ${delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-400" : ""}`}>
                    {delta >= 0 ? "+" : ""}{delta}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-5">
          <button
            className="text-xs uppercase tracking-wider text-gold-400 hover:text-gold-500"
            onClick={() => setShowTricks((v) => !v)}
          >
            {showTricks ? "▼" : "▶"} Review {r.tricks.length} rounds
          </button>
          {showTricks && (
            <div className="mt-2 space-y-2 max-h-72 overflow-auto pr-1">
              {r.tricks.map((t, i) => {
                const winner = t.winner !== undefined ? state.players[t.winner] : undefined;
                return (
                  <div key={`round-${i}`} className="flex items-center gap-2 text-xs">
                    <div className="text-stone-500 w-8">#{i + 1}</div>
                    <div className="flex gap-0.5">
                      {t.plays.map((tp) => (
                        <div key={`r${i}-${tp.player}-${tp.card.id}`} className={tp.player === t.winner ? "ring-1 ring-gold-400 rounded-md" : ""}>
                          <CardView card={tp.card} small staticView />
                        </div>
                      ))}
                    </div>
                    <div className="ml-auto text-right">
                      <div className="text-stone-300">{winner?.name}</div>
                      <div className="text-gold-400 font-mono">+{t.points}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button className="btn btn-primary w-full mt-6 text-base" onClick={onNext}>
          Play Again
        </button>
      </div>
    </div>
  );
}
