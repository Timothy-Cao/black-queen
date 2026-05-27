import { useState } from "react";
import { CardView } from "./CardView";
import { Card, AIPersonality } from "../game/types";

type Cfg = { name: string; isAI: boolean; aiPersonality?: AIPersonality };

interface Props {
  onStart: (configs: Cfg[], target: number, shuffleIntensity: number, randomizeShuffle: boolean) => void;
  onOpenAIInfo?: () => void;
}

const DEFAULTS: Cfg[] = [
  { name: "Player", isAI: false },
  { name: "Adam", isAI: true, aiPersonality: "hard-3" },
  { name: "Bravo", isAI: true, aiPersonality: "hard-3" },
  { name: "Charlie", isAI: true, aiPersonality: "hard-3" },
  { name: "Delta", isAI: true, aiPersonality: "hard-3" },
];

const HERO_CARDS: Card[] = [
  { suit: "S", rank: 12, id: "S12" },
  { suit: "H", rank: 14, id: "H14" },
  { suit: "D", rank: 10, id: "D10" },
  { suit: "C", rank: 13, id: "C13" },
  { suit: "S", rank: 5, id: "S5" },
];

const TARGET_SCORE = 300; // Always 300 — matches total points in the 65-card deck.

export function Lobby({ onStart, onOpenAIInfo }: Props) {
  const [players, setPlayers] = useState<Cfg[]>(DEFAULTS);
  // Continuous shuffle intensity 0..1. 0 = light (current default, biased hands), 1 = full random.
  const [shuffleIntensity, setShuffleIntensity] = useState<number>(0);
  // When checked, intensity is re-rolled uniformly at random for every dealt round.
  const [randomizeShuffle, setRandomizeShuffle] = useState<boolean>(false);
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="glass rounded-2xl p-8 w-[640px] animate-floatIn relative overflow-visible">
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
          <p className="text-sm text-stone-300 mt-1 mb-4">
            A 5-player game of hidden partnerships and bidding.
          </p>
          {onOpenAIInfo && (
            <button
              onClick={onOpenAIInfo}
              className="group w-full mb-6 flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left bg-gradient-to-br from-gold-500/10 to-amber-500/5 ring-1 ring-gold-400/25 hover:ring-gold-400/60 hover:from-gold-500/15 transition-all"
              title="Open the AI mini-paper"
            >
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-gold-400/90 mb-0.5">A mini-paper</div>
                <div className="text-[13px] text-stone-100 leading-snug">
                  AI Discussion <span className="text-stone-400 font-normal">— how Hard / Hard-2 / Hard-3 / Hard-4 were built</span>
                </div>
              </div>
              <span className="text-gold-400 text-lg group-hover:translate-x-0.5 transition-transform" aria-hidden>→</span>
            </button>
          )}
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
                <label className="flex items-center gap-1.5 text-xs text-stone-300 select-none cursor-pointer w-12 justify-end">
                  <input
                    type="checkbox"
                    checked={p.isAI}
                    onChange={(e) => {
                      const a = players.slice();
                      a[i] = {
                        ...a[i],
                        isAI: e.target.checked,
                        aiPersonality: e.target.checked ? (a[i].aiPersonality ?? "normal") : undefined,
                      };
                      setPlayers(a);
                    }}
                    className="accent-gold-500"
                  />
                  AI
                </label>
                {p.isAI ? (
                  <select
                    className="text-xs bg-white/5 rounded px-2 py-1.5 text-stone-100 border border-white/10 outline-none focus:border-gold-500 w-24"
                    value={p.aiPersonality ?? "normal"}
                    onChange={(e) => {
                      const a = players.slice();
                      a[i] = { ...a[i], aiPersonality: e.target.value as AIPersonality };
                      setPlayers(a);
                    }}
                  >
                    <option value="hard-4" className="text-black">Hard-4 (preview)</option>
                    <option value="hard-3" className="text-black">Hard-3</option>
                    <option value="hard-2" className="text-black">Hard-2</option>
                    <option value="hard" className="text-black">Hard</option>
                    <option value="normal" className="text-black">Normal</option>
                    <option value="random" className="text-black">Random</option>
                  </select>
                ) : (
                  <div className="w-24" />
                )}
              </div>
            ))}
          </div>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm text-stone-300">Shuffle</label>
              <span className="text-[10px] uppercase tracking-wider text-gold-400/70 font-mono">
                {randomizeShuffle ? "random"
                  : shuffleIntensity <= 0.025 ? "light"
                  : shuffleIntensity >= 0.975 ? "full"
                  : `${Math.round(shuffleIntensity * 100)}%`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(shuffleIntensity * 100)}
              onChange={(e) => setShuffleIntensity(parseInt(e.target.value, 10) / 100)}
              disabled={randomizeShuffle}
              className={`w-full accent-gold-500 ${randomizeShuffle ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
              aria-label="Shuffle intensity"
            />
            <label className="flex items-center gap-1.5 mt-2 text-xs text-stone-300 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={randomizeShuffle}
                onChange={(e) => setRandomizeShuffle(e.target.checked)}
                className="accent-gold-500"
              />
              <span>Randomize shuffle</span>
            </label>
          </div>
          <button
            className="btn btn-primary w-full text-lg py-3"
            onClick={() => onStart(
              players, TARGET_SCORE,
              randomizeShuffle ? Math.random() : shuffleIntensity,
              randomizeShuffle,
            )}
          >
            Start
          </button>
        </div>
      </div>
    </div>
  );
}
