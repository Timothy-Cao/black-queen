// Auth context: tracks the Supabase session, exposes Google sign-in / sign-out.
// When Supabase isn't configured (`configured: false`), the app skips the gate.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User, SupabaseClient } from "@supabase/supabase-js";
import { getSupabase, isAuthConfigured } from "../lib/supabase";

interface AuthState {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  configured: false,
  loading: false,
  session: null,
  user: null,
  authError: null,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // Only "loading" while we resolve an existing session — and only if configured.
  const [loading, setLoading] = useState<boolean>(isAuthConfigured);
  const [authError, setAuthError] = useState<string | null>(null);
  const clientRef = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    // When unconfigured, `loading` already initialised to false — nothing to do
    // and supabase-js is never imported.
    if (!isAuthConfigured) return;
    let mounted = true;
    let unsub: (() => void) | undefined;
    getSupabase().then(async (client) => {
      if (!client || !mounted) return;
      clientRef.current = client;

      // OAuth callback: exchange ?code=... for a session ourselves so any error
      // is visible (detectSessionInUrl would swallow it). Strip the code after.
      try {
        const params = new URLSearchParams(window.location.search);
        const oauthErr = params.get("error_description") || params.get("error");
        const code = params.get("code");
        if (oauthErr) {
          setAuthError(oauthErr);
        } else if (code) {
          const { error } = await client.auth.exchangeCodeForSession(code);
          if (error) setAuthError(error.message);
          window.history.replaceState({}, "", window.location.pathname + window.location.hash);
        }
      } catch (e) {
        setAuthError(e instanceof Error ? e.message : "Sign-in failed.");
      }
      if (!mounted) return;

      const { data } = await client.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
      const { data: sub } = client.auth.onAuthStateChange((_event, s) => {
        setSession(s);
        if (s) setAuthError(null);
      });
      unsub = () => sub.subscription.unsubscribe();
    });
    return () => {
      mounted = false;
      unsub?.();
    };
  }, []);

  const signInWithGoogle = async () => {
    const client = clientRef.current ?? (await getSupabase());
    if (!client) return;
    await client.auth.signInWithOAuth({
      provider: "google",
      // Return to the app root; supabase-js (detectSessionInUrl) exchanges the
      // ?code=... for a session on load.
      options: { redirectTo: window.location.origin + "/" },
    });
  };

  const signOut = async () => {
    const client = clientRef.current ?? (await getSupabase());
    if (client) await client.auth.signOut();
    setSession(null);
  };

  return (
    <AuthCtx.Provider
      value={{
        configured: isAuthConfigured,
        loading,
        session,
        user: session?.user ?? null,
        authError,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthCtx);
