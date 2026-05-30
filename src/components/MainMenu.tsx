// Top-level main menu: Single Player, Multiplayer (Host/Join), AI Notes, How to Play.
import { useAuth } from "../auth/AuthContext";
import { sfx } from "../game/sfx";

interface Props {
  onSinglePlayer: () => void;
  onHost: () => void;
  onJoin: () => void;
  onLeaderboard: () => void;
  onAIInfo: () => void;
  onHowToPlay: () => void;
}

export function MainMenu({ onSinglePlayer, onHost, onJoin, onLeaderboard, onAIInfo, onHowToPlay }: Props) {
  const { configured, user, signOut } = useAuth();
  const click = (fn: () => void) => () => { sfx.uiClick(); fn(); };

  return (
    <div className="w-screen h-screen felt flex items-center justify-center">
      <div className="glass rounded-2xl p-8 w-[min(94vw,480px)] animate-floatIn">
        <div className="text-center">
          <h1 className="text-4xl font-semibold text-gold-400 tracking-wide">Black Queen</h1>
          <p className="mt-1 text-sm text-stone-300/70">5-player trick-taking · hidden partners</p>
        </div>

        <div className="mt-7 flex flex-col gap-3">
          <button className="btn btn-primary w-full py-3 text-base" onClick={click(onSinglePlayer)}>
            Single Player
          </button>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase tracking-wider text-stone-400/80 mb-2 px-1">Multiplayer</div>
            <div className="flex gap-3">
              <button className="btn btn-ghost flex-1 py-2.5" onClick={click(onHost)}>Host</button>
              <button className="btn btn-ghost flex-1 py-2.5" onClick={click(onJoin)}>Join</button>
            </div>
          </div>

          <button className="btn btn-ghost w-full py-2.5" onClick={click(onLeaderboard)}>🏆 Leaderboard</button>

          <div className="flex gap-3">
            <button className="btn btn-ghost flex-1 py-2.5" onClick={click(onAIInfo)}>AI Notes</button>
            <button className="btn btn-ghost flex-1 py-2.5" onClick={click(onHowToPlay)}>How to Play</button>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between text-[11px] text-stone-400/70">
          <span className="truncate max-w-[60%]">
            {configured && user
              ? `Signed in as ${user.email ?? user.user_metadata?.name ?? "player"}`
              : "Offline / practice mode"}
          </span>
          {configured && user && (
            <button className="hover:text-stone-100 underline" onClick={signOut}>Sign out</button>
          )}
        </div>

        <nav className="mt-3 flex justify-center gap-3 text-[11px] text-stone-300/60">
          <a className="hover:text-stone-100" href="/privacy.html">Privacy</a>
          <a className="hover:text-stone-100" href="mailto:timcao.support@gmail.com">Contact</a>
        </nav>
      </div>
    </div>
  );
}
