import { useMemo, useState } from "react";
import { Card, GameState, PlayerId, Rank, SUIT_GLYPHS, SUITS, Suit, RANK_LABEL } from "../game/types";

interface Props {
  state: GameState;
  me: PlayerId;
  onDeclare: (trump: Suit, partnerCard: Card) => void;
  onHide?: () => void;
}

// Ranks present in the deck (no 2/3/4/6, only 7♠ for sevens)
const ALL_RANKS: Rank[] = [14, 13, 12, 11, 10, 9, 8, 7, 5];

export function DeclarePanel({ state, me, onDeclare, onHide }: Props) {
  const [trump, setTrump] = useState<Suit | undefined>();
  const [pick, setPick] = useState<{ suit: Suit; rank: Rank } | undefined>();
  const myHand = state.round.hands[me];

  const myCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of myHand) m[`${c.suit}${c.rank}`] = (m[`${c.suit}${c.rank}`] || 0) + 1;
    return m;
  }, [myHand]);
  const totalCopies = (s: Suit, r: Rank) => (s === "S" && r === 7 ? 1 : 2);
  const isAvailable = (s: Suit, r: Rank) => {
    // Card exists in deck (excluded 2/3/4/6 and only 7♠)
    if (![5, 7, 8, 9, 10, 11, 12, 13, 14].includes(r)) return false;
    if (r === 7 && s !== "S") return false;
    return true;
  };
  const ownsAll = (s: Suit, r: Rank) => (myCounts[`${s}${r}`] || 0) >= totalCopies(s, r);

  const handleDeclare = () => {
    if (!trump || !pick) return;
    // Build the partner Card descriptor — engine matches by suit+rank, id is informational.
    const partnerCard: Card = { suit: pick.suit, rank: pick.rank, id: `${pick.suit}${pick.rank}_0` };
    onDeclare(trump, partnerCard);
  };

  return (
    <div className="glass rounded-2xl p-6 w-[680px] animate-floatIn">
      <div className="flex items-baseline justify-between mb-2 gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-gold-400">Declare</div>
          <div className="text-sm text-stone-200 mt-1">
            You won the bid at <span className="font-bold text-gold-400">{state.round.winningBid}</span>.
            Choose trump and call the partner card.
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {onHide && (
            <button className="btn btn-ghost text-[11px]" onClick={onHide} title="Peek at the board">
              Hide
            </button>
          )}
          <div className="text-[11px] text-stone-500 max-w-[240px] text-right leading-snug">
            Whoever holds a copy is your hidden partner. Can't call a card you own all of.
          </div>
        </div>
      </div>

      {/* Trump */}
      <div className="mt-3">
        <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1">Trump suit</div>
        <div className="flex gap-2">
          {SUITS.map((s) => {
            const red = s === "H" || s === "D";
            return (
              <button
                key={s}
                className={`text-2xl w-12 h-12 rounded-lg border transition ${
                  trump === s
                    ? "bg-gold-500 text-stone-900 border-gold-500"
                    : `bg-white/5 border-white/10 hover:bg-white/10 ${red ? "text-rose-300" : "text-stone-100"}`
                }`}
                onClick={() => setTrump(s)}
              >
                {SUIT_GLYPHS[s]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Partner card */}
      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1">
          Partner card · italic = in your hand, ✕ = you own all copies (illegal)
        </div>
        <div className="space-y-1">
          {SUITS.map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <div className={`w-6 text-lg ${s === "H" || s === "D" ? "text-rose-300" : "text-stone-200"}`}>
                {SUIT_GLYPHS[s]}
              </div>
              {ALL_RANKS.map((rank) => {
                if (!isAvailable(s, rank)) {
                  return <div key={`${s}${rank}`} className="w-9 h-9" />;
                }
                const count = myCounts[`${s}${rank}`] || 0;
                const blocked = ownsAll(s, rank);
                const isSel = pick?.suit === s && pick?.rank === rank;
                return (
                  <button
                    key={`${s}${rank}`}
                    disabled={blocked}
                    onClick={() => setPick({ suit: s, rank })}
                    className={`w-9 h-9 text-xs rounded border transition relative ${
                      isSel
                        ? "bg-gold-500 text-stone-900 border-gold-500 font-bold"
                        : blocked
                        ? "bg-white/5 border-rose-700/40 text-stone-600 cursor-not-allowed"
                        : count > 0
                        ? "bg-white/5 border-amber-300/40 text-amber-200 italic hover:bg-white/10"
                        : "bg-white/5 border-white/10 text-stone-200 hover:bg-white/10"
                    }`}
                    title={
                      blocked
                        ? "You own all copies — illegal"
                        : count > 0
                        ? `You own ${count} copy — partner has the other`
                        : `Both copies held by opponents — 1 or 2 partners`
                    }
                  >
                    {RANK_LABEL[rank]}
                    {blocked && (
                      <span className="absolute -top-1 -right-1 text-rose-400 text-[10px]">✕</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-5 pt-4 border-t border-white/10">
        <div className="text-sm text-stone-300">
          {trump && (
            <>
              Trump <span className={trump === "H" || trump === "D" ? "text-rose-300" : "text-stone-100"}>{SUIT_GLYPHS[trump]}</span>
            </>
          )}
          {pick && (
            <span className="ml-3">
              · Partner card{" "}
              <span className="text-gold-400 font-bold">
                {RANK_LABEL[pick.rank]}
                {SUIT_GLYPHS[pick.suit]}
              </span>
            </span>
          )}
        </div>
        <div className="flex-1" />
        <button
          className={`btn btn-primary ${!trump || !pick ? "btn-disabled" : ""}`}
          onClick={handleDeclare}
        >
          Declare
        </button>
      </div>
    </div>
  );
}
