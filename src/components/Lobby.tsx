import { useState } from "react";
import { CardView } from "./CardView";
import { Card, ShuffleMode, AIPersonality } from "../game/types";

type Cfg = { name: string; isAI: boolean; aiPersonality?: AIPersonality };

interface Props {
  onStart: (configs: Cfg[], target: number, shuffleMode: ShuffleMode) => void;
}

const DEFAULTS: Cfg[] = [
  { name: "You", isAI: false },
  { name: "Alex", isAI: true, aiPersonality: "normal" },
  { name: "Bri", isAI: true, aiPersonality: "normal" },
  { name: "Cam", isAI: true, aiPersonality: "normal" },
  { name: "Dee", isAI: true, aiPersonality: "normal" },
];

const HERO_CARDS: Card[] = [
  { suit: "S", rank: 12, id: "S12" },
  { suit: "H", rank: 14, id: "H14" },
  { suit: "D", rank: 10, id: "D10" },
  { suit: "C", rank: 13, id: "C13" },
  { suit: "S", rank: 5, id: "S5" },
];

const TARGET_SCORE = 300; // Always 300 — matches total points in the 65-card deck.

export function Lobby({ onStart }: Props) {
  const [players, setPlayers] = useState<Cfg[]>(DEFAULTS);
  const [shuffleMode, setShuffleMode] = useState<ShuffleMode>("light");
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
          <div className="flex items-center gap-3 mb-2">
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
          </div>
          {shuffleMode === "full" && (
            <div className="text-xs text-amber-300/90 mb-6 italic">
              Beware: full shuffle is kinda lame.
            </div>
          )}
          {shuffleMode !== "full" && <div className="mb-6" />}
          <button
            className="btn btn-primary w-full text-lg py-3"
            onClick={() => onStart(players, TARGET_SCORE, shuffleMode)}
          >
            Deal &amp; Begin
          </button>
        </div>
      </div>
    </div>
  );
}
