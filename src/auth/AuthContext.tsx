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
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  configured: false,
  loading: false,
  session: null,
  user: null,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // Only "loading" while we resolve an existing session — and only if configured.
  const [loading, setLoading] = useState<boolean>(isAuthConfigured);
  const clientRef = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    // When unconfigured, `loading` already initialised to false — nothing to do
    // and supabase-js is never imported.
    if (!isAuthConfigured) return;
    let mounted = true;
    let unsub: (() => void) | undefined;
    getSupabase().then((client) => {
      if (!client || !mounted) return;
      clientRef.current = client;
      client.auth.getSession().then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setLoading(false);
      });
      const { data: sub } = client.auth.onAuthStateChange((_event, s) => setSession(s));
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
