import { useState } from "react";
import { CardView } from "./CardView";
import { Card, AIPersonality } from "../game/types";
import { botProfile } from "../data/botProfiles";
import { botElo } from "../data/botLadder";
import { sfx } from "../game/sfx";

// Discrete shuffle settings, from most biased to a true uniform shuffle.
// Lower intensity = more clumped, dramatic hands; 1 = perfectly random.
const SHUFFLE_STOPS = [
  { label: "Chaos",    intensity: 0,    desc: "Wildly biased hands. Points clump together and the swings are huge." },
  { label: "Fun",      intensity: 0.33, desc: "Lively hands with a strong tilt toward the action." },
  { label: "Standard", intensity: 0.66, desc: "A gentle bias, close to an ordinary shuffle." },
  { label: "Uniform",  intensity: 1,    desc: "A perfectly random, real world shuffle." },
];

function ShuffleStepper({ step, setStep, disabled }: { step: number; setStep: (n: number) => void; disabled?: boolean }) {
  const last = SHUFFLE_STOPS.length - 1;
  return (
    <div className={disabled ? "opacity-40 pointer-events-none select-none" : "select-none"}>
      {/* Track + nodes */}
      <div className="relative flex justify-between items-center h-4 px-1.5">
        <div className="absolute left-1.5 right-1.5 top-1/2 -translate-y-1/2 h-1 rounded-full bg-white/10" />
        <div
          className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1 rounded-full bg-gold-500/70 transition-all"
          style={{ width: `${(step / last) * 100}%` }}
        />
        {SHUFFLE_STOPS.map((s, i) => {
          const active = i === step;
          const filled = i <= step;
          return (
            <button
              key={s.label}
              type="button"
              aria-label={s.label}
              onClick={() => { sfx.uiClick(); setStep(i); }}
              className="relative z-10 rounded-full transition-all"
              style={{
                width: active ? 16 : 11,
                height: active ? 16 : 11,
                background: filled ? "#e0a93a" : "rgba(255,255,255,0.18)",
                boxShadow: active ? "0 0 0 4px rgba(224,169,58,0.25)" : "none",
              }}
            />
          );
        })}
      </div>
      {/* Labels */}
      <div className="flex justify-between mt-2">
        {SHUFFLE_STOPS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => { sfx.uiClick(); setStep(i); }}
            className={`text-[10px] uppercase tracking-wide transition-colors ${i === step ? "text-gold-300 font-semibold" : "text-stone-500 hover:text-stone-300"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// AI choices in the Lobby dropdown (strongest-first display order; ranking is
// the Elo ladder, this is just menu order). hard-4b is experimental, omitted.
const AI_OPTIONS: AIPersonality[] = ["hard-4", "hard-3", "hard-2", "hard", "normal", "random"];

type Cfg = { name: string; isAI: boolean; aiPersonality?: AIPersonality };

interface Props {
  onStart: (configs: Cfg[], target: number, shuffleIntensity: number, randomizeShuffle: boolean) => void;
  onOpenAIInfo?: () => void;
}

const DEFAULTS: Cfg[] = [
  { name: "Player", isAI: false },
  { name: "Adam", isAI: true, aiPersonality: "hard-4" },
  { name: "Bravo", isAI: true, aiPersonality: "hard-4" },
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
  // Shuffle is chosen from 4 discrete stops (see SHUFFLE_STOPS). Default = Standard.
  const [shuffleStep, setShuffleStep] = useState<number>(2);
  // When checked, intensity is re-rolled uniformly at random for every dealt round.
  const [randomizeShuffle, setRandomizeShuffle] = useState<boolean>(false);
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="glass rounded-2xl p-5 sm:p-8 w-full max-w-[640px] animate-floatIn relative overflow-visible">
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
          <h1 className="font-display text-4xl sm:text-5xl text-gold-400 tracking-wide drop-shadow-[0_0_18px_rgba(245,196,107,0.25)] mb-6">
            Black Queen
          </h1>
          <div className="text-[11px] uppercase tracking-widest text-gold-400/80 mb-2">Players</div>
          <div className="space-y-2 mb-5">
            {players.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 text-stone-400 text-sm font-mono">{i + 1}</div>
                <input
                  className="flex-1 min-w-0 bg-white/5 rounded-lg px-3 py-2 text-stone-100 border border-white/10 outline-none focus:border-gold-500"
                  value={p.name}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onChange={(e) => {
                    const a = players.slice();
                    a[i] = { ...a[i], name: e.target.value };
                    setPlayers(a);
                  }}
                  placeholder="Name"
                />
                <label
                  className={`flex items-center gap-1.5 text-xs text-stone-300 select-none w-12 justify-end ${i === 0 ? "cursor-pointer" : "cursor-default opacity-60"}`}
                  title={i === 0 ? "Toggle off to spectate (AI plays your seat)" : "Opponents are always AI in single player"}
                >
                  <input
                    type="checkbox"
                    autoComplete="off"
                    // Seats 1-4 are always AI (single player has one local seat).
                    checked={i === 0 ? p.isAI : true}
                    disabled={i !== 0}
                    onChange={(e) => {
                      if (i !== 0) return;
                      const a = players.slice();
                      a[i] = {
                        ...a[i],
                        isAI: e.target.checked,
                        aiPersonality: e.target.checked ? (a[i].aiPersonality ?? "hard-3") : undefined,
                      };
                      setPlayers(a);
                    }}
                    className="accent-gold-500"
                  />
                  AI
                </label>
                {p.isAI ? (
                  <select
                    className="text-xs bg-white/5 rounded px-2 py-1.5 text-stone-100 border border-white/10 outline-none focus:border-gold-500 w-32"
                    value={p.aiPersonality ?? "normal"}
                    onChange={(e) => {
                      const a = players.slice();
                      a[i] = { ...a[i], aiPersonality: e.target.value as AIPersonality };
                      setPlayers(a);
                    }}
                  >
                    {AI_OPTIONS.map((id) => {
                      const pr = botProfile(id);
                      const elo = botElo(id);
                      return <option key={id} value={id} className="text-black">{pr.codename}{elo !== null ? ` (${elo})` : ""}</option>;
                    })}
                  </select>
                ) : (
                  <div className="w-24" />
                )}
              </div>
            ))}
          </div>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-sm text-stone-300">Shuffle</label>
              <label className="flex items-center gap-1.5 text-xs text-stone-300 select-none cursor-pointer">
                <input
                  type="checkbox"
                  autoComplete="off"
                  checked={randomizeShuffle}
                  onChange={(e) => setRandomizeShuffle(e.target.checked)}
                  className="accent-gold-500"
                />
                <span>Randomize each round</span>
              </label>
            </div>
            <ShuffleStepper step={shuffleStep} setStep={setShuffleStep} disabled={randomizeShuffle} />
            <div className="mt-2 text-[11px] text-stone-400 leading-snug min-h-[2.2em]">
              {randomizeShuffle
                ? "A different shuffle strength is rolled every round."
                : SHUFFLE_STOPS[shuffleStep].desc}
            </div>
          </div>
          <button
            className="btn btn-primary w-full text-lg py-3"
            onClick={() => onStart(
              players, TARGET_SCORE,
              randomizeShuffle ? Math.random() : SHUFFLE_STOPS[shuffleStep].intensity,
              randomizeShuffle,
            )}
          >
            Start
          </button>
          {onOpenAIInfo && (
            <div className="mt-3 text-center">
              <button
                onClick={onOpenAIInfo}
                className="inline-flex items-center gap-1.5 text-[11px] text-gold-400/80 hover:text-gold-400 transition-colors"
              >
                <span className="text-gold-400/60" aria-hidden>✦</span>
                AI Notes
                <span aria-hidden>↗</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
