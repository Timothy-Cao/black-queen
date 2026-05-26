import { GameState, SUIT_GLYPHS, RANK_LABEL, PlayerId, cardPoints } from "../game/types";
import { ScoreCell } from "./ScoreCell";

interface Props {
  state: GameState;
  onHelp?: () => void;
  onHistory?: () => void;
}

// Cute emoji faces per player slot — mirrors PlayerSeat.
const AVATAR_EMOJI = ["🦊", "🐱", "🐻", "🐼", "🐶"];
function emojiOf(id: number) { return AVATAR_EMOJI[id % AVATAR_EMOJI.length]; }

/** How many times this player has played the partner card so far (0, 1 or 2). */
function partnerCardPlays(state: GameState, playerId: PlayerId): number {
  const r = state.round;
  if (!r.partnerCard) return 0;
  let count = 0;
  const matches = (suit: string, rank: number) =>
    suit === r.partnerCard!.suit && rank === r.partnerCard!.rank;
  for (const t of r.tricks) {
    for (const p of t.plays) {
      if (p.player === playerId && matches(p.card.suit, p.card.rank)) count++;
    }
  }
  const cur = r.currentTrick;
  if (cur) {
    for (const p of cur.plays) {
      if (p.player === playerId && matches(p.card.suit, p.card.rank)) count++;
    }
  }
  return count;
}

export function Sidebar({ state, onHelp, onHistory }: Props) {
  const r = state.round;
  const callerId = r.bidder;
  const callerName = callerId !== undefined ? state.players[callerId].name : "—";
  // Revealed teammates (caller + every revealed partner) share a team color.
  const teamIds = new Set<PlayerId>();
  if (callerId !== undefined) teamIds.add(callerId);
  for (const id of r.revealedPartners) teamIds.add(id);

  // Captured points per player this game (= this round, since 1 game = 1 round).
  const claimed: Record<PlayerId, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const p of state.players) {
    claimed[p.id] = p.tricksWon.reduce((s, c) => s + cardPoints(c), 0);
  }

  // Caller pinned to top; everyone else in id order.
  const ordered = callerId !== undefined
    ? [state.players[callerId], ...state.players.filter((p) => p.id !== callerId)]
    : state.players.slice();

  return (
    <div className="text-stone-100 h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-gold-400">Game</div>
        <div className="flex gap-1">
          {onHistory && state.history.length > 0 && (
            <button
              className="w-6 h-6 rounded-full border border-white/20 text-stone-300 text-xs hover:bg-white/10"
              title="Past games"
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

      {/* Claimed points — this game only */}
      <div className="mt-5">
        <div className="text-xs uppercase tracking-widest text-gold-400 mb-1">Claimed points</div>
        <table className="w-full text-sm">
          <tbody>
            {ordered.map((p) => {
              const isCaller = p.id === callerId;
              const isRevealedPartner = r.revealedPartners.includes(p.id);
              const onTeam = teamIds.has(p.id);
              const plays = partnerCardPlays(state, p.id);
              const isDouble = !isCaller && plays >= 2;
              const rowColor = onTeam ? "text-gold-400" : "text-stone-200";
              return (
                <tr key={p.id} className="border-b border-white/5 last:border-0">
                  <td className={`py-1 ${rowColor}`}>
                    <span className="mr-1.5">{emojiOf(p.id)}</span>
                    <span>{p.name}</span>
                    {p.isAI && <span className="ml-1 text-[10px] text-stone-500">AI</span>}
                    {isCaller && <span className="ml-1" title="Caller">★</span>}
                    {isRevealedPartner && <span className="ml-1" title="Revealed partner">◆</span>}
                    {isDouble && (
                      <span
                        className="ml-1 text-[10px] px-1 rounded bg-amber-400/25 text-amber-300 font-bold align-middle"
                        title="Played the partner card twice"
                      >
                        ×2
                      </span>
                    )}
                    {/* Dealer is shown in the round-info grid above + highlighted on the seat — no duplicate badge here. */}
                  </td>
                  <td className="text-right font-mono">
                    <ScoreCell value={claimed[p.id]} className={onTeam ? "text-gold-400" : ""} />
                  </td>
                </tr>
              );
            })}
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
