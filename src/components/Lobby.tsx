import { useState } from "react";
import { CardView } from "./CardView";
import { Card, ShuffleMode } from "../game/types";

interface Props {
  onStart: (configs: { name: string; isAI: boolean }[], target: number, shuffleMode: ShuffleMode) => void;
}

const DEFAULTS = [
  { name: "You", isAI: false },
  { name: "Alex", isAI: true },
  { name: "Bri", isAI: true },
  { name: "Cam", isAI: true },
  { name: "Dee", isAI: true },
];

// Decorative fan
const HERO_CARDS: Card[] = [
  { suit: "S", rank: 12, id: "S12" },
  { suit: "H", rank: 14, id: "H14" },
  { suit: "D", rank: 10, id: "D10" },
  { suit: "C", rank: 13, id: "C13" },
  { suit: "S", rank: 5, id: "S5" },
];

export function Lobby({ onStart }: Props) {
  const [players, setPlayers] = useState(DEFAULTS);
  const [target, setTarget] = useState(300);
  const [shuffleMode, setShuffleMode] = useState<ShuffleMode>("light");
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="glass rounded-2xl p-8 w-[640px] animate-floatIn relative overflow-visible">
        {/* Decorative card fan */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 flex pointer-events-none">
          {HERO_CARDS.map((c, i) => (
            <div
              key={c.id}
              style={{
                marginLeft: i === 0 ? 0 : -36,
                transform: `rotate(${(i - 2) * 8}deg) translateY(${Math.abs(i - 2) * 4}px)`,
                transformOrigin: "bottom center",
                filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.5))",
              }}
            >
              <CardView card={c} />
            </div>
          ))}
        </div>
        <div className="pt-16">
          <h1 className="font-display text-5xl text-gold-400 tracking-wide drop-shadow-[0_0_18px_rgba(245,196,107,0.25)]">
            Black Queen
          </h1>
          <p className="text-sm text-stone-300 mt-1 mb-6">
            A 5-player trick-taking game of hidden partnerships and bidding.
          </p>
          <div className="text-[11px] uppercase tracking-widest text-gold-400/80 mb-2">Players</div>
          <div className="space-y-2 mb-5">
            {players.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 text-stone-400 text-sm font-mono">{i + 1}</div>
                <input
                  className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-stone-100 border border-white/10 outline-none focus:border-gold-500"
                  value={p.name}
                  onChange={(e) => {
                    const a = players.slice();
                    a[i] = { ...a[i], name: e.target.value };
                    setPlayers(a);
                  }}
                  placeholder="Name"
                />
                <label className="flex items-center gap-1.5 text-xs text-stone-300 select-none cursor-pointer w-16 justify-end">
                  <input
                    type="checkbox"
                    checked={p.isAI}
                    onChange={(e) => {
                      const a = players.slice();
                      a[i] = { ...a[i], isAI: e.target.checked };
                      setPlayers(a);
                    }}
                    className="accent-gold-500"
                  />
                  AI
                </label>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mb-3">
            <label className="text-sm text-stone-300">First to</label>
            <input
              type="number"
              min={150}
              max={1000}
              step={50}
              value={target}
              onChange={(e) => setTarget(parseInt(e.target.value) || 300)}
              className="w-24 bg-white/5 rounded-lg px-3 py-2 text-stone-100 border border-white/10"
            />
            <span className="text-sm text-stone-300">points wins</span>
            <div className="ml-auto text-xs text-stone-500">≈ {Math.max(2, Math.ceil(target / 100))}–{Math.max(4, Math.ceil(target / 75))} rounds</div>
          </div>
          <div className="flex items-center gap-3 mb-6">
            <label className="text-sm text-stone-300">Shuffle</label>
            <div className="flex gap-1">
              {(["light", "full"] as ShuffleMode[]).map((m) => (
                <button
                  key={m}
                  className={`px-3 py-1.5 rounded text-xs uppercase tracking-wider ${
                    shuffleMode === m ? "bg-gold-500 text-stone-900" : "bg-white/5 text-stone-300 hover:bg-white/10"
                  }`}
                  onClick={() => setShuffleMode(m)}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="ml-auto text-xs text-stone-500 max-w-[200px] text-right leading-tight">
              {shuffleMode === "light"
                ? "Hands biased toward a dominant suit — more dramatic bidding."
                : "Pure random shuffle — uniform suit spreads."}
            </div>
          </div>
          <button className="btn btn-primary w-full text-lg py-3" onClick={() => onStart(players, target, shuffleMode)}>
            Deal &amp; Begin
          </button>
          <details className="mt-4 text-sm text-stone-300">
            <summary className="cursor-pointer text-gold-400 select-none">Quick rules</summary>
            <div className="mt-2 space-y-1 leading-relaxed">
              <p>Each round, players bid for the right to choose trump and call a hidden partner.</p>
              <p>The Caller names one card by rank + suit; whoever holds it is the secret ally — no one announces it. They only reveal by playing the card.</p>
              <p>Caller + partner together must capture ≥ bid in card points. If they make it, both score the bid; if they fail, both lose it.</p>
              <p>Card points: <b className="text-gold-400">Q♠ = 30</b>, A = 15, 10 = 10, 5 = 5 — 150 total in the deck.</p>
              <p>Follow suit if possible; trump beats non-trump.</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
