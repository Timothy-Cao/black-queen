import { GameState, SUIT_GLYPHS, RANK_LABEL } from "../game/types";
import { ScoreCell } from "./ScoreCell";

interface Props {
  state: GameState;
  onHelp?: () => void;
  onHistory?: () => void;
}

export function Sidebar({ state, onHelp, onHistory }: Props) {
  const r = state.round;
  const callerName = r.bidder !== undefined ? state.players[r.bidder].name : "—";
  return (
    <div className="text-stone-100 h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-gold-400">Round {r.roundNumber}</div>
        <div className="flex gap-1">
          {onHistory && state.history.length > 0 && (
            <button
              className="w-6 h-6 rounded-full border border-white/20 text-stone-300 text-xs hover:bg-white/10"
              title="Past rounds"
              onClick={onHistory}
            >
              ⟲
            </button>
          )}
          {onHelp && (
            <button
              className="w-6 h-6 rounded-full border border-white/20 text-stone-300 text-xs hover:bg-white/10"
              title="Help & rules"
              onClick={onHelp}
            >
              ?
            </button>
          )}
        </div>
      </div>

      {/* Round info */}
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <div className="text-stone-400">Dealer</div><div>{state.players[r.dealer].name}</div>
        <div className="text-stone-400">Caller</div><div>{callerName}</div>
        <div className="text-stone-400">Bid</div><div>{r.winningBid ?? "—"}</div>
        <div className="text-stone-400">Trump</div>
        <div>{r.trump ? <span className={r.trump==="H"||r.trump==="D"?"text-rose-400":"text-stone-200"}>{SUIT_GLYPHS[r.trump]}</span> : "—"}</div>
        <div className="text-stone-400">Called card</div>
        <div>
          {r.partnerCard ? (
            <span className={r.partnerCard.suit==="H"||r.partnerCard.suit==="D"?"text-rose-400":"text-stone-200"}>
              {RANK_LABEL[r.partnerCard.rank]}{SUIT_GLYPHS[r.partnerCard.suit]}
            </span>
          ) : "—"}
        </div>
      </div>

      {/* Claimed points (cumulative game scores) */}
      <div className="mt-5">
        <div className="text-xs uppercase tracking-widest text-gold-400 mb-1">Claimed points</div>
        <table className="w-full text-sm">
          <tbody>
            {state.players.map((p) => (
              <tr key={p.id} className="border-b border-white/5 last:border-0">
                <td className="py-1">
                  <span className={p.id === r.bidder ? "text-gold-400" : ""}>{p.name}</span>
                  {p.isAI && <span className="ml-1 text-[10px] text-stone-500">AI</span>}
                  {p.id === r.bidder && <span className="ml-1 text-gold-400" title="Caller">★</span>}
                  {p.id === r.dealer && <span className="ml-1 text-stone-300" title="Dealer">D</span>}
                </td>
                <td className="text-right font-mono">
                  <ScoreCell value={p.scoreTotal} className={p.scoreTotal < 0 ? "text-rose-400" : ""} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Spacer pushes log to the bottom */}
      <div className="flex-1 min-h-[12px]" />

      {/* Log — anchored to bottom, shorter */}
      <div>
        <div className="text-xs uppercase tracking-widest text-gold-400 mb-1">Log</div>
        <div className="text-[11px] space-y-0.5 max-h-44 overflow-auto pr-1">
          {state.log.slice(-12).reverse().map((l) => (
            <div key={l.id} className={
              l.kind === "score" ? "text-gold-400" :
              l.kind === "reveal" ? "text-amber-300" :
              l.kind === "bid" ? "text-emerald-300" :
              l.kind === "system" ? "text-stone-500 italic" : "text-stone-300"
            }>
              {l.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
