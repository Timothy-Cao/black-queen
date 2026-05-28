// Auth context: tracks the Supabase session, exposes Google sign-in / sign-out.
// When Supabase isn't configured (`configured: false`), the app skips the gate.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isAuthConfigured } from "../lib/supabase";

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

  useEffect(() => {
    // When unconfigured, `loading` already initialised to false — nothing to do.
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      // Return to the app root; supabase-js (detectSessionInUrl) exchanges the
      // ?code=... for a session on load.
      options: { redirectTo: window.location.origin + "/" },
    });
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
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
