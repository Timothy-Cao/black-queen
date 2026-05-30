import { CARD_SKINS, useCardSkin, CardSkin } from "./CardSkinContext";
import { sfx } from "../game/sfx";

interface Props {
  onClose: () => void;
  musicVol: number;
  setMusicVol: (v: number) => void;
  sfxVol: number;
  setSfxVol: (v: number) => void;
  // Subtitle under the "Settings" title (e.g. "Game paused").
  subtitle?: string;
  // Game-only controls. Omit on the menu to render an audio + display variant.
  speed?: "slow" | "normal" | "fast";
  setSpeed?: (s: "slow" | "normal" | "fast") => void;
  showHands?: boolean;
  setShowHands?: (v: boolean | ((p: boolean) => boolean)) => void;
  onHelp?: () => void;
  onQuit?: () => void;
}

// Full-screen Settings overlay. Used both in-game (pauses the table) and on the
// menu (audio + display only — game-specific props omitted).
export function SettingsModal(p: Props) {
  const { skin, setSkin } = useCardSkin();
  const showGameplay = p.speed !== undefined && p.setSpeed !== undefined;
  const showAdvanced = p.showHands !== undefined && p.setShowHands !== undefined;
  const showFooter = p.onHelp !== undefined || p.onQuit !== undefined;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-md animate-floatIn"
      onMouseDown={(e) => { if (e.target === e.currentTarget) p.onClose(); }}
    >
      <div className="glass rounded-2xl w-[440px] max-w-[92vw] max-h-[90vh] overflow-auto shadow-2xl border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <div className="font-display text-2xl text-gold-400 leading-none">Settings</div>
            <div className="text-[11px] uppercase tracking-widest text-stone-500 mt-1">{p.subtitle ?? "Game paused"}</div>
          </div>
          <button
            className="text-stone-400 hover:text-stone-100 text-2xl leading-none w-8 h-8 rounded-full hover:bg-white/10"
            onClick={() => { sfx.uiClick(); p.onClose(); }}
            title="Close (Esc)"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Audio */}
          <Section title="Audio">
            <Slider
              label="Music"
              value={p.musicVol}
              onChange={p.setMusicVol}
            />
            <Slider
              label="Sound FX"
              value={p.sfxVol}
              onChange={p.setSfxVol}
              onCommit={() => sfx.cardPlay()}
            />
          </Section>

          {/* Gameplay (in-game only) */}
          {showGameplay && (
            <Section title="Gameplay">
              <Field label="AI speed">
                <div className="flex gap-1">
                  {(["slow", "normal", "fast"] as const).map((s) => (
                    <button
                      key={s}
                      className={`text-[11px] uppercase px-2.5 py-1 rounded-md transition-colors ${p.speed === s ? "bg-gold-500/25 text-gold-300" : "text-stone-400 hover:bg-white/5"}`}
                      onClick={() => { sfx.uiClick(); p.setSpeed!(s); }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Field>
            </Section>
          )}

          {/* Appearance */}
          <Section title="Appearance">
            <Field label="Card design">
              <select
                className="text-sm bg-white/5 rounded-md px-2 py-1.5 text-stone-100 border border-white/10 outline-none focus:border-gold-500"
                value={skin}
                onChange={(e) => { sfx.uiClick(); setSkin(e.target.value as CardSkin); }}
              >
                {CARD_SKINS.map((s) => (
                  <option key={s.value} value={s.value} className="text-black">{s.label}</option>
                ))}
              </select>
            </Field>
            <div className="text-[11px] text-stone-500 leading-snug -mt-1">
              {CARD_SKINS.find((s) => s.value === skin)?.description}
            </div>
          </Section>

          {/* Advanced (in-game only) */}
          {showAdvanced && (
            <Section title="Advanced">
              <Field label={<span className="text-stone-400 text-[12px]">Reveal hands (debug)</span>}>
                <Toggle on={p.showHands!} onClick={() => p.setShowHands!((v) => !v)} onLabel="On" offLabel="Off" danger />
              </Field>
            </Section>
          )}
        </div>

        {/* Footer actions */}
        {showFooter && (
          <div className="px-6 py-4 border-t border-white/10 flex gap-2">
            {p.onHelp && (
              <button
                className="btn btn-ghost flex-1 text-sm py-2"
                onClick={() => { sfx.uiClick(); p.onHelp!(); }}
              >
                How to play
              </button>
            )}
            {p.onQuit && (
              <button
                className="flex-1 text-sm py-2 rounded-lg text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 transition-colors"
                onClick={() => { sfx.uiClick(); p.onQuit!(); }}
              >
                Quit to menu
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-gold-400/80 mb-2">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-stone-200">{label}</span>
      {children}
    </div>
  );
}

function Slider({ label, value, onChange, onCommit }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-stone-200 w-20 shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        onChange={(e) => onChange(parseInt(e.target.value, 10) / 100)}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
        className="accent-gold-500 flex-1 cursor-pointer"
        aria-label={label}
      />
      <span className="text-[11px] font-mono text-stone-400 w-9 text-right shrink-0">{pct}%</span>
    </div>
  );
}

function Toggle({ on, onClick, onLabel, offLabel, danger }: {
  on: boolean; onClick: () => void; onLabel: string; offLabel: string; danger?: boolean;
}) {
  return (
    <button
      className={`text-xs px-2.5 py-1 rounded-md ${on ? (danger ? "bg-rose-500/20 text-rose-300" : "bg-gold-500/20 text-gold-400") : "bg-white/10 text-stone-400"}`}
      onClick={onClick}
    >
      {on ? onLabel : offLabel}
    </button>
  );
}
