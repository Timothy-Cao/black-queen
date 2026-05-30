import { BOT_LADDER } from "../data/botLadder";

export function Leaderboard({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-screen h-screen felt overflow-y-auto">
      <div className="mx-auto w-full max-w-[640px] px-4 py-6">
        <div className="flex items-center gap-3 mb-5">
          <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={onBack}>← Menu</button>
          <h1 className="font-display text-3xl sm:text-4xl text-gold-400">ELO</h1>
        </div>

        <div className="glass rounded-xl overflow-hidden animate-floatIn">
          {BOT_LADDER.map((b) => (
            <div
              key={b.bot}
              className="grid grid-cols-[1fr_96px] items-center border-b border-white/5 px-4 py-3 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="font-semibold text-stone-100">{b.name}</span>
                <span className="ml-2 text-xs text-stone-400">{b.type}</span>
              </span>
              <span className="text-right font-mono text-gold-400">{b.elo}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
