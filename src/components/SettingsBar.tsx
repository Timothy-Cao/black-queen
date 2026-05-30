import { sfx } from "../game/sfx";

interface Props {
  onOpenSettings: () => void;
  speed: "slow" | "normal" | "fast";
  setSpeed: (s: "slow" | "normal" | "fast") => void;
}

// Slim always-visible toolbar (top-left): a gear that opens the full-screen
// Settings, plus an always-visible AI speed control so it's never buried.
export function SettingsBar({ onOpenSettings, speed, setSpeed }: Props) {
  return (
    <div className="absolute top-2 left-2 z-30 flex items-center gap-2">
      <button
        className="glass rounded-full w-9 h-9 flex items-center justify-center text-stone-200 hover:bg-white/10 shrink-0"
        onClick={() => { sfx.uiClick(); onOpenSettings(); }}
        title="Settings (Esc)"
      >
        ⚙
      </button>
      <div className="glass rounded-full flex items-center gap-1 px-1.5 py-1" title="AI play speed">
        <span className="text-[9px] uppercase tracking-wider text-stone-500 pl-1 pr-0.5 hidden sm:inline">Speed</span>
        {(["slow", "normal", "fast"] as const).map((s) => (
          <button
            key={s}
            className={`text-[10px] uppercase px-1.5 py-0.5 rounded-full transition-colors ${speed === s ? "bg-gold-500/25 text-gold-300" : "text-stone-400 hover:bg-white/5"}`}
            onClick={() => { sfx.uiClick(); setSpeed(s); }}
            title={`AI speed: ${s}`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
