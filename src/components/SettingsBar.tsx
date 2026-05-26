import { useState, useRef, useEffect } from "react";
import { CARD_SKINS, useCardSkin, CardSkin } from "./CardSkinContext";

interface Props {
  showHands: boolean;
  setShowHands: (v: boolean | ((p: boolean) => boolean)) => void;
  muted: boolean;
  toggleMute: () => void;
  onHelp: () => void;
  onQuit: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  speed: "slow" | "normal" | "fast";
  setSpeed: (s: "slow" | "normal" | "fast") => void;
}

export function SettingsBar(p: Props) {
  const [open, setOpen] = useState(false);
  const { skin, setSkin } = useCardSkin();
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      window.addEventListener("mousedown", h);
      return () => window.removeEventListener("mousedown", h);
    }
  }, [open]);
  return (
    <div className="absolute top-2 left-2 z-30" ref={ref}>
      <button
        className="glass rounded-full w-9 h-9 flex items-center justify-center text-stone-200 hover:bg-white/10"
        onClick={() => setOpen((v) => !v)}
        title="Settings"
      >
        ⚙
      </button>
      {open && (
        <div className="glass rounded-xl p-3 mt-2 w-56 animate-floatIn space-y-2 shadow-lg">
          <Row>
            <span>Sound</span>
            <button
              className={`text-xs px-2 py-0.5 rounded ${p.muted ? "bg-white/10 text-stone-400" : "bg-gold-500/20 text-gold-400"}`}
              onClick={p.toggleMute}
            >
              {p.muted ? "Off" : "On"}
            </button>
          </Row>
          <Row>
            <span>Speed</span>
            <div className="flex gap-1">
              {(["slow", "normal", "fast"] as const).map((s) => (
                <button
                  key={s}
                  className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${p.speed === s ? "bg-gold-500/20 text-gold-400" : "text-stone-400 hover:bg-white/5"}`}
                  onClick={() => p.setSpeed(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </Row>
          <Row>
            <span>Info panel</span>
            <button
              className={`text-xs px-2 py-0.5 rounded ${p.sidebarOpen ? "bg-gold-500/20 text-gold-400" : "bg-white/10 text-stone-400"}`}
              onClick={() => p.setSidebarOpen((v) => !v)}
            >
              {p.sidebarOpen ? "Open" : "Closed"}
            </button>
          </Row>
          <Row>
            <span>Card design</span>
            <select
              className="text-xs bg-white/5 rounded px-2 py-1 text-stone-100 border border-white/10 outline-none focus:border-gold-500"
              value={skin}
              onChange={(e) => setSkin(e.target.value as CardSkin)}
            >
              {CARD_SKINS.map((s) => (
                <option key={s.value} value={s.value} className="text-black">
                  {s.label}
                </option>
              ))}
            </select>
          </Row>
          <div className="text-[10px] text-stone-500 leading-tight -mt-1 px-0.5">
            {CARD_SKINS.find((s) => s.value === skin)?.description}
          </div>
          <div className="h-px bg-white/10 my-1" />
          <Row>
            <span className="text-stone-400 text-[11px]">Reveal hands (debug)</span>
            <button
              className={`text-xs px-2 py-0.5 rounded ${p.showHands ? "bg-rose-500/20 text-rose-300" : "bg-white/10 text-stone-400"}`}
              onClick={() => p.setShowHands((v) => !v)}
            >
              {p.showHands ? "On" : "Off"}
            </button>
          </Row>
          <div className="h-px bg-white/10 my-1" />
          <button
            className="w-full text-left text-sm text-stone-200 hover:bg-white/5 rounded px-2 py-1"
            onClick={p.onHelp}
          >
            How to play
          </button>
          <button
            className="w-full text-left text-sm text-rose-300 hover:bg-rose-500/10 rounded px-2 py-1"
            onClick={p.onQuit}
          >
            Quit to lobby
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between text-sm text-stone-200">{children}</div>;
}
