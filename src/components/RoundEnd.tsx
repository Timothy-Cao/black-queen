import { useState } from "react";
import { GameState, SUIT_GLYPHS, PlayerId } from "../game/types";
import { CardView } from "./CardView";
import { TipChip } from "./TipChip";

interface Props {
  state: GameState;
  onNext: () => void;
}

export function RoundEnd({ state, onNext }: Props) {
  const [showTricks, setShowTricks] = useState(false);
  const r = state.round;
  const bidder = state.players[r.bidder!];
  const partners = (r.partners ?? []).map((id) => state.players[id]);
  const teamIds = new Set<PlayerId>([r.bidder!, ...(r.partners ?? [])]);
  const teamPts = ([0, 1, 2, 3, 4] as PlayerId[])
    .filter((p) => teamIds.has(p))
    .reduce<number>((s, p) => s + (r.roundPoints?.[p] ?? 0), 0);
  const made = teamPts >= (r.winningBid ?? 0);
  const isGameOver = state.phase === "game_end";
  const champion = isGameOver ? state.players.slice().sort((a, b) => b.scoreTotal - a.scoreTotal)[0] : undefined;
  const teamLabel = [bidder, ...partners].map((p) => p.name).join(" + ");
  return (
    <div className="fixed inset-0 flex items-center justify-center z-30 bg-black/60 backdrop-blur-sm">
      <div className={`glass rounded-2xl p-8 w-[680px] max-h-[90vh] overflow-auto animate-floatIn ${
        isGameOver ? "ring-2 ring-gold-400/60 shadow-[0_0_60px_rgba(245,196,107,0.3)]" : ""
      }`}>
        <div className="text-xs uppercase tracking-widest text-gold-400">
          {isGameOver ? "Champion crowned" : `Round ${r.roundNumber} complete`}
        </div>
        {isGameOver ? (
          <>
            <h2 className="font-display text-5xl mt-1 text-gold-400 drop-shadow-[0_0_18px_rgba(245,196,107,0.5)]">
              {champion?.name} wins!
            </h2>
            <div className="text-sm text-stone-300 mt-1">
              Final score <span className="font-mono text-gold-400">{champion?.scoreTotal}</span>
            </div>
          </>
        ) : (
          <h2 className="font-display text-2xl mt-1">
            <span className={made ? "text-emerald-300" : "text-rose-300"}>
              {teamLabel}
            </span>
            {" "}{made ? "made the bid." : "fell short."}
          </h2>
        )}
        <div className="mt-3 text-sm text-stone-300">
          Bid <span className="font-semibold">{r.winningBid}</span>
          {" · "}Trump <span className={r.trump==="H"||r.trump==="D"?"text-rose-400":"text-stone-100"}>{r.trump && SUIT_GLYPHS[r.trump]}</span>
          {" · "}Captured <span className={made ? "text-emerald-300" : "text-rose-300"}>{teamPts}</span>
          {partners.length === 2 && <span className="ml-2 text-amber-300">· dual partner</span>}
        </div>
        <table className="w-full mt-4 text-sm">
          <thead><tr className="text-stone-400 text-xs uppercase border-b border-white/10">
            <th className="text-left py-1">Player</th>
            <th className="text-right">Captured</th>
            <th className="text-right">Δ</th>
            <th className="text-right">Total</th>
          </tr></thead>
          <tbody>
            {state.players.map((p) => {
              const onBidderTeam = teamIds.has(p.id);
              return (
                <tr key={p.id} className={`border-b border-white/5 last:border-0 ${onBidderTeam ? "text-gold-400" : ""}`}>
                  <td className="py-1">
                    {p.name}
                    {p.id === r.bidder && " ★"}
                    {(r.partners ?? []).includes(p.id) && " ◆"}
                  </td>
                  <td className="text-right font-mono">{r.roundPoints?.[p.id] ?? 0}</td>
                  <td className={`text-right font-mono ${(r.deltaScores?.[p.id] ?? 0) > 0 ? "text-emerald-300" : (r.deltaScores?.[p.id] ?? 0) < 0 ? "text-rose-400" : ""}`}>
                    {(r.deltaScores?.[p.id] ?? 0) >= 0 ? "+" : ""}{r.deltaScores?.[p.id] ?? 0}
                  </td>
                  <td className="text-right font-mono">
                    <span className={p.scoreTotal < 0 ? "text-rose-400" : ""}>{p.scoreTotal}</span>
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
            {showTricks ? "▼" : "▶"} Review {r.tricks.length} tricks
          </button>
          {showTricks && (
            <div className="mt-2 space-y-2 max-h-72 overflow-auto pr-1">
              {r.tricks.map((t, i) => {
                const winner = t.winner !== undefined ? state.players[t.winner] : undefined;
                return (
                  <div key={`trick-${i}`} className="flex items-center gap-2 text-xs">
                    <div className="text-stone-500 w-8">#{i + 1}</div>
                    <div className="flex gap-0.5">
                      {t.plays.map((tp) => (
                        <div key={`t${i}-${tp.player}-${tp.card.id}`} className={tp.player === t.winner ? "ring-1 ring-gold-400 rounded-md" : ""}>
                          <CardView card={tp.card} small />
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

        {!isGameOver && <TipChip className="mt-5" />}
        <button className="btn btn-primary w-full mt-6 text-base" onClick={onNext}>
          {isGameOver ? "New Game" : "Next Round"}
        </button>
      </div>
    </div>
  );
}
