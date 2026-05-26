import { GameState, SUIT_GLYPHS, cardPoints, PlayerId, TOTAL_POINTS_IN_DECK } from "../game/types";
import { ScoreCell } from "./ScoreCell";

interface Props {
  state: GameState;
  onHelp?: () => void;
  onHistory?: () => void;
}

export function Sidebar({ state, onHelp, onHistory }: Props) {
  const r = state.round;
  const bidderName = r.bidder !== undefined ? state.players[r.bidder].name : "—";
  const partnerLabel = (() => {
    if (!r.partnerCard) return "—";
    if (!r.partnerRevealed) return "Hidden";
    const names = r.revealedPartners.map((id) => state.players[id].name).join(" + ");
    const remaining = (r.partners?.length ?? 0) - r.revealedPartners.length;
    return remaining > 0 ? `${names} (+${remaining} hidden)` : names;
  })();

  // Live captured points per side
  let bidderTeamPts = 0;
  let opponentPts = 0;
  if (r.phase === "playing" || r.phase === "round_end") {
    const team = new Set<PlayerId>([r.bidder!, ...r.revealedPartners]);
    for (const p of state.players) {
      const pts = p.tricksWon.reduce((s, c) => s + cardPoints(c), 0);
      if (team.has(p.id)) bidderTeamPts += pts;
      else opponentPts += pts;
    }
  }
  const winBid = r.winningBid ?? 0;
  const opponentGoal = TOTAL_POINTS_IN_DECK - winBid + 1; // opponents win by capturing strictly more than 300 - bid
  const teamProgress = winBid > 0 ? Math.min(100, (bidderTeamPts / winBid) * 100) : 0;

  return (
    <div className="text-stone-100">
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
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <div className="text-stone-400">Dealer</div><div>{state.players[r.dealer].name}</div>
        <div className="text-stone-400">Bidder</div><div>{bidderName}</div>
        <div className="text-stone-400">Bid</div><div>{r.winningBid ?? "—"}</div>
        <div className="text-stone-400">Trump</div>
        <div>{r.trump ? <span className={r.trump==="H"||r.trump==="D"?"text-rose-400":"text-stone-200"}>{SUIT_GLYPHS[r.trump]}</span> : "—"}</div>
        <div className="text-stone-400">Partner</div>
        <div>{r.partnerRevealed ? <span className="text-amber-300">{partnerLabel}</span> : <span className="text-stone-500 italic">{partnerLabel}</span>}</div>
      </div>

      {(r.phase === "playing" || r.phase === "round_end") && winBid > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-widest text-gold-400 mb-1">Captured</div>
          <div className="flex items-center text-xs text-stone-300 mb-1">
            <span>Bidder team</span>
            <span className="ml-auto font-mono">
              <span className={bidderTeamPts >= winBid ? "text-emerald-300" : "text-gold-400"}>{bidderTeamPts}</span>
              <span className="text-stone-500"> / {winBid}</span>
            </span>
          </div>
          <div className="h-2 rounded bg-white/10 overflow-hidden mb-2">
            <div
              className={`h-full transition-all duration-500 ${bidderTeamPts >= winBid ? "bg-emerald-400" : "bg-gold-400"}`}
              style={{ width: `${teamProgress}%` }}
            />
          </div>
          <div className="flex items-center text-xs text-stone-300">
            <span>Opponents</span>
            <span className="ml-auto font-mono">
              <span className={opponentPts >= opponentGoal ? "text-emerald-300" : ""}>{opponentPts}</span>
              <span className="text-stone-500"> / {opponentGoal}</span>
            </span>
          </div>
          <div className="text-[10px] text-stone-500 mt-1 italic">
            300 pts in the deck. Opponents need {opponentGoal} to defeat the bid.
            {!r.partnerRevealed && " Bidder team total counts known team only until reveal."}
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="text-xs uppercase tracking-widest text-gold-400 mb-1">Scores</div>
        <table className="w-full text-sm">
          <tbody>
            {state.players.map((p) => (
              <tr key={p.id} className="border-b border-white/5 last:border-0">
                <td className="py-1">
                  <span className={p.id === r.bidder ? "text-gold-400" : ""}>{p.name}</span>
                  {p.isAI && <span className="ml-1 text-[10px] text-stone-500">AI</span>}
                  {p.id === r.bidder && <span className="ml-1 text-gold-400" title="Bidder">★</span>}
                  {r.revealedPartners.includes(p.id) && <span className="ml-1 text-amber-300" title="Partner">◆</span>}
                </td>
                <td className="text-right font-mono">
                  <ScoreCell value={p.scoreTotal} className={p.scoreTotal < 0 ? "text-rose-400" : ""} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <div className="text-xs uppercase tracking-widest text-gold-400 mb-1">Log</div>
        <div className="text-xs space-y-1 max-h-[34vh] overflow-auto pr-1">
          {state.log.slice(-60).reverse().map((l) => (
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
