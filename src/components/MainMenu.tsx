// Top-level main menu: Single Player, Multiplayer (Host/Join), AI Notes, How to Play.
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { sfx } from "../game/sfx";
import { SettingsModal } from "./SettingsModal";

interface Props {
  onSinglePlayer: () => void;
  onHost: () => void;
  onJoin: () => void;
  onLeaderboard: () => void;
  onAIInfo: () => void;
  onHowToPlay: () => void;
  musicVol: number;
  setMusicVol: (v: number) => void;
  sfxVol: number;
  setSfxVol: (v: number) => void;
}

export function MainMenu({
  onSinglePlayer, onHost, onJoin, onLeaderboard, onAIInfo, onHowToPlay,
  musicVol, setMusicVol, sfxVol, setSfxVol,
}: Props) {
  const { configured, user, signOut, authError } = useAuth();
  const click = (fn: () => void) => () => { sfx.uiClick(); fn(); };
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="w-screen h-screen felt flex items-center justify-center">
      {/* Settings gear — audio + display, reachable before a game starts. */}
      <button
        className="fixed top-3 right-3 z-40 glass rounded-full w-9 h-9 flex items-center justify-center text-stone-200 hover:bg-white/10"
        onClick={() => { sfx.uiClick(); setSettingsOpen(true); }}
        title="Settings"
      >
        ⚙
      </button>
      {settingsOpen && (
        <SettingsModal
          subtitle="Music & display"
          onClose={() => setSettingsOpen(false)}
          musicVol={musicVol}
          setMusicVol={setMusicVol}
          sfxVol={sfxVol}
          setSfxVol={setSfxVol}
          onHelp={() => { setSettingsOpen(false); onHowToPlay(); }}
        />
      )}
      <div className="glass rounded-2xl p-8 w-[min(94vw,480px)] animate-floatIn">
        <div className="text-center">
          <h1 className="text-4xl font-semibold text-gold-400 tracking-wide">Black Queen</h1>
        </div>

        <div className="mt-7 flex flex-col gap-3">
          <button className="btn btn-primary w-full py-3 text-base" onClick={click(onSinglePlayer)}>
            Single Player
          </button>

          <div className="flex gap-3">
            <button className="btn btn-ghost flex-1 py-2.5" onClick={click(onHost)}>Host</button>
            <button className="btn btn-ghost flex-1 py-2.5" onClick={click(onJoin)}>Join</button>
          </div>

          <button
            className="btn btn-ghost w-full py-2.5 btn-disabled"
            disabled
            title="Coming soon"
          >
            🏆 ELO Ladder
          </button>

          <div className="flex gap-3">
            <button className="btn btn-ghost flex-1 py-2.5" onClick={click(onAIInfo)}>AI Notes</button>
            <button className="btn btn-ghost flex-1 py-2.5" onClick={click(onHowToPlay)}>How to Play</button>
          </div>
        </div>

        {configured && user && (
          <div className="mt-6 flex items-center justify-between text-[11px] text-stone-400/70">
            <span className="flex items-center gap-1.5 truncate max-w-[65%]">
              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-400/80" />
              <span className="truncate">Signed in as {user.email ?? user.user_metadata?.name ?? "player"}</span>
            </span>
            <button className="hover:text-stone-100 underline shrink-0" onClick={() => { sfx.uiClick(); signOut(); }}>Sign out</button>
          </div>
        )}
        {authError && (
          <p className="mt-2 text-[11px] text-rose-300 break-words">Sign-in failed: {authError}</p>
        )}

        <nav className="mt-3 flex justify-center gap-3 text-[11px] text-stone-300/60">
          <a className="hover:text-stone-100" href="/privacy.html">Privacy</a>
          <a className="hover:text-stone-100" href="mailto:timcao.support@gmail.com">Contact</a>
        </nav>
      </div>
    </div>
  );
}
