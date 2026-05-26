import { GameState, RoundState, SUIT_GLYPHS, PlayerId, RANK_LABEL } from "../game/types";

interface Props {
  state: GameState;
  onClose: () => void;
}

export function HistoryModal({ state, onClose }: Props) {
  const rounds = state.history;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass rounded-2xl p-6 w-[720px] max-h-[88vh] overflow-auto animate-floatIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl text-gold-400">Past rounds</h2>
          <button className="btn btn-ghost text-sm" onClick={onClose}>Close</button>
        </div>
        {rounds.length === 0 ? (
          <div className="text-sm text-stone-400 italic">No completed rounds yet.</div>
        ) : (
          <div className="space-y-3">
            {rounds.map((r) => (
              <RoundCard key={r.roundNumber} state={state} round={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RoundCard({ state, round }: { state: GameState; round: RoundState }) {
  const callerName = round.bidder !== undefined ? state.players[round.bidder].name : "—";
  const partners = round.partners ?? [];
  const teamIds = new Set<PlayerId>([round.bidder!, ...partners]);
  const teamPts = ([0, 1, 2, 3, 4] as PlayerId[])
    .filter((p) => teamIds.has(p))
    .reduce<number>((s, p) => s + (round.roundPoints?.[p] ?? 0), 0);
  const made = teamPts >= (round.winningBid ?? 0);
  const partnerNames = partners.map((id) => state.players[id].name).join(" + ") || "(no partners)";
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex items-baseline justify-between">
        <div className="font-semibold text-sm text-gold-400">Round {round.roundNumber}</div>
        <div className={`text-xs font-semibold ${made ? "text-emerald-300" : "text-rose-300"}`}>
          {made ? "MADE" : "FAILED"} {made ? "+" : "−"}{round.winningBid}
        </div>
      </div>
      <div className="text-xs text-stone-300 mt-1">
        <span className="text-stone-400">Caller</span> {callerName} ★
        {" · "}
        <span className="text-stone-400">Partner card</span>{" "}
        {round.partnerCard ? (
          <span className="text-gold-400 font-bold">
            {RANK_LABEL[round.partnerCard.rank]}
            {SUIT_GLYPHS[round.partnerCard.suit]}
          </span>
        ) : "—"}
        {" · "}
        <span className="text-stone-400">Partners</span>{" "}
        <span className="text-amber-300">{partnerNames}</span>
        {" · "}
        <span className="text-stone-400">Trump</span>{" "}
        <span className={round.trump === "H" || round.trump === "D" ? "text-rose-300" : "text-stone-100"}>
          {round.trump && SUIT_GLYPHS[round.trump]}
        </span>
        {" · "}
        <span className="text-stone-400">Captured</span>{" "}
        <span className={made ? "text-emerald-300" : "text-rose-300"}>{teamPts}</span>
        {" / "}
        <span>{round.winningBid}</span>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1 text-[11px]">
        {state.players.map((p) => {
          const onTeam = teamIds.has(p.id);
          const delta = round.deltaScores?.[p.id] ?? 0;
          return (
            <div key={p.id} className={`rounded px-1.5 py-1 ${onTeam ? "bg-gold-500/10" : "bg-white/5"}`}>
              <div className="text-stone-300 truncate">{p.name}</div>
              <div className={`font-mono ${delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-300" : "text-stone-500"}`}>
                {delta > 0 ? "+" : ""}{delta}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
