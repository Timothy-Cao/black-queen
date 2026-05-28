// Multiplayer Host / Join screens. UI shells, ready to wire to the Supabase
// backend (see docs/multiplayer_todo.md Phases 2-6). Networking is not built
// yet, so the action buttons currently surface a "coming soon" state rather
// than creating/joining a real room.
import { useState } from "react";

function BackBar({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={onBack}>← Menu</button>
      <h2 className="text-xl font-semibold text-gold-400">{title}</h2>
    </div>
  );
}

const COMING_SOON =
  "Online multiplayer is being wired up (server-authoritative rooms with hidden hands). " +
  "The flow below is the intended UX — it activates once the backend ships.";

export function MultiplayerHost({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-screen h-screen felt flex items-center justify-center">
      <div className="glass rounded-2xl p-8 w-[min(94vw,480px)] animate-floatIn">
        <BackBar onBack={onBack} title="Host a game" />
        <p className="text-sm text-stone-300/80">
          Create a private room and share the code. Empty seats are filled with the Hard-4 AI;
          if a player drops, the AI takes over their seat.
        </p>
        <button className="btn btn-primary w-full py-3 mt-6" disabled title="Coming soon">
          Create room
        </button>
        <p className="mt-4 text-[11px] text-amber-300/70">{COMING_SOON}</p>
      </div>
    </div>
  );
}

export function MultiplayerJoin({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState("");
  return (
    <div className="w-screen h-screen felt flex items-center justify-center">
      <div className="glass rounded-2xl p-8 w-[min(94vw,480px)] animate-floatIn">
        <BackBar onBack={onBack} title="Join a game" />
        <p className="text-sm text-stone-300/80">Enter the room code your host shared.</p>
        <input
          className="mt-4 w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-center text-xl tracking-[0.3em] uppercase text-stone-100 outline-none focus:border-gold-400/60"
          placeholder="CODE"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
        />
        <button
          className="btn btn-primary w-full py-3 mt-5"
          disabled={code.length < 4}
          title="Coming soon"
        >
          Join room
        </button>
        <p className="mt-4 text-[11px] text-amber-300/70">{COMING_SOON}</p>
      </div>
    </div>
  );
}
