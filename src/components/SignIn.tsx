// Sign-in gate. Shown when Supabase is configured and there's no session.
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";

export function SignIn({ onBack, reason }: { onBack?: () => void; reason?: string }) {
  const { signInWithGoogle, authError } = useAuth();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      setBusy(false);
    }
    // On success the browser redirects to Google; no need to clear busy.
  };

  return (
    <div className="w-screen h-screen felt flex items-center justify-center">
      <div className="glass rounded-2xl p-8 w-[min(92vw,420px)] text-center animate-floatIn">
        <h1 className="text-3xl font-semibold text-gold-400 tracking-wide">Black Queen</h1>
        <p className="mt-2 text-sm text-stone-300/80">
          {reason ?? "Sign in to play online with friends."}
        </p>
        <button
          className="btn btn-primary mt-6 w-full flex items-center justify-center gap-2"
          onClick={onClick}
          disabled={busy}
        >
          <GoogleGlyph />
          {busy ? "Redirecting…" : "Sign in with Google"}
        </button>
        {authError && (
          <p className="mt-3 text-[12px] text-rose-300 break-words">
            Sign-in failed: {authError}
          </p>
        )}
        {onBack && (
          <button className="mt-4 text-xs text-stone-300/80 hover:text-stone-100 underline" onClick={onBack}>
            ← Back to menu
          </button>
        )}
        <nav className="mt-4 flex justify-center gap-3 text-[11px] text-stone-300/70">
          <a className="hover:text-stone-100" href="/privacy.html">Privacy</a>
          <a className="hover:text-stone-100" href="mailto:timcao.support@gmail.com">Contact</a>
        </nav>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 5.1 29.5 3 24 3 16.3 3 9.7 7.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 45c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.3 35.9 26.8 37 24 37c-5.3 0-9.7-2.6-11.3-6.9l-6.5 5C9.6 40.6 16.2 45 24 45z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C41.9 35.5 45 30.2 45 24c0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}
