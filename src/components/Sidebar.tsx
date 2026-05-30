import { GameState, SUIT_GLYPHS, RANK_LABEL, PlayerId, cardPoints } from "../game/types";
import { ScoreCell } from "./ScoreCell";
import { aiCharacter } from "./PlayerSeat";

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

  // Order: caller first, then revealed partners (reveal order, dedup), then remaining
  // players in id order. The caller + revealed partners get visually grouped (boxed) so
  // the confirmed team reads as a single unit.
  const teamOrdered: PlayerId[] = [];
  if (callerId !== undefined) teamOrdered.push(callerId);
  for (const id of r.revealedPartners) {
    if (!teamOrdered.includes(id)) teamOrdered.push(id);
  }
  const ordered = [
    ...teamOrdered.map((id) => state.players[id]),
    ...state.players.filter((p) => !teamOrdered.includes(p.id)),
  ];

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
        {(() => {
          // Render the caller + revealed partners as a single bordered group, then
          // each remaining player as a plain row. Inside the team group, only the
          // caller gets the ★ — partners are confirmed by being in the box.
          const renderRow = (p: typeof state.players[number], opts?: { dim?: boolean }) => {
            const isCaller = p.id === callerId;
            const onTeam = teamIds.has(p.id);
            const plays = partnerCardPlays(state, p.id);
            const isDouble = !isCaller && plays >= 2;
            const rowColor = onTeam ? "text-gold-400" : opts?.dim ? "text-stone-300" : "text-stone-200";
            return (
              <div key={p.id} className={`flex items-center py-1 ${rowColor}`}>
                {p.isAI ? (
                  <img src={aiCharacter(p.id)} alt="" draggable={false} className="w-5 h-5 mr-1.5 rounded-full object-cover shrink-0" />
                ) : (
                  <span className="mr-1.5">{emojiOf(p.id)}</span>
                )}
                <span className="flex-1 truncate">
                  {p.name}
                  {p.isAI && <span className="ml-1 text-[10px] text-stone-500">AI</span>}
                  {isCaller && <span className="ml-1" title="Caller">★</span>}
                  {isDouble && (
                    <span
                      className="ml-1 text-[10px] px-1 rounded bg-amber-400/25 text-amber-300 font-bold align-middle"
                      title="Played the partner card twice"
                    >
                      ×2
                    </span>
                  )}
                </span>
                <span className="font-mono text-right">
                  <ScoreCell value={claimed[p.id]} className={onTeam ? "text-gold-400" : ""} />
                </span>
              </div>
            );
          };
          const teamPlayers = teamOrdered.map((id) => state.players[id]);
          const others = state.players.filter((p) => !teamOrdered.includes(p.id));
          return (
            <div className="text-sm">
              {teamPlayers.length > 0 && (
                <div
                  className="rounded-lg border border-gold-400/45 px-2 py-0.5 mb-2"
                  style={{ background: "linear-gradient(180deg, rgba(245,196,107,0.10), rgba(245,196,107,0.03))" }}
                  title="Confirmed caller team"
                >
                  {teamPlayers.map((p, i) => (
                    <div
                      key={`team-${p.id}`}
                      className={i < teamPlayers.length - 1 ? "border-b border-gold-400/15" : ""}
                    >
                      {renderRow(p)}
                    </div>
                  ))}
                </div>
              )}
              <div>
                {others.map((p, i) => (
                  <div
                    key={`other-${p.id}`}
                    className={i < others.length - 1 ? "border-b border-white/5" : ""}
                  >
                    {renderRow(p)}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
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
