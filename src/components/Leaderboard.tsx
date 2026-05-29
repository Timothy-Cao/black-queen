// In-game Elo leaderboard. AI-only for now (hardcoded from docs/elo/elo.json);
// becomes the live human board once multiplayer + accounts land.
import { BOT_LADDER, LADDER_META } from "../data/botLadder";

const MEDAL = ["🥇", "🥈", "🥉"];

export function Leaderboard({ onBack }: { onBack: () => void }) {
  const max = Math.max(...BOT_LADDER.map((b) => b.elo));
  const min = Math.min(...BOT_LADDER.map((b) => b.elo));
  const span = Math.max(1, max - min);

  return (
    <div className="w-screen h-screen felt overflow-y-auto">
      <div className="mx-auto w-full max-w-[640px] px-4 py-6">
        <div className="flex items-center gap-3 mb-5">
          <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={onBack}>← Menu</button>
          <h1 className="font-display text-3xl sm:text-4xl text-gold-400">Leaderboard</h1>
        </div>

        <p className="text-sm text-stone-300/80 mb-1">{LADDER_META.note}</p>
        <p className="text-[11px] text-stone-400/70 mb-5">{LADDER_META.method} · {LADDER_META.anchor}.</p>

        <div className="space-y-2">
          {BOT_LADDER.map((b, i) => {
            const pct = ((b.elo - min) / span) * 100;
            return (
              <div key={b.bot} className="glass rounded-xl p-3 flex items-center gap-3 animate-floatIn">
                <div className="w-8 text-center text-lg font-semibold text-stone-300 shrink-0">
                  {MEDAL[i] ?? <span className="text-stone-400 text-sm">{i + 1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-stone-100 truncate">{b.name}</span>
                    <span className="font-mono text-gold-400 text-lg shrink-0">{b.elo}</span>
                  </div>
                  {/* relative-strength bar */}
                  <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full bg-gold-500/70" style={{ width: `${Math.max(6, pct)}%` }} />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-stone-400/80 truncate">{b.blurb}</span>
                    <span className="text-[10px] font-mono text-stone-500 shrink-0">±{Math.round((b.ci95[1] - b.ci95[0]) / 2)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-[11px] text-stone-400/60">
          Elo here measures relative strength among the AIs; the spread is modest because
          Black Queen is a 5-player team game where one seat can't dominate. Ratings come
          from {LADDER_META.anchor.toLowerCase()}, with 95% confidence intervals shown as ±.
        </p>
      </div>
    </div>
  );
}
