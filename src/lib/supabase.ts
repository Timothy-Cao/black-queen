// Supabase client. Lazily configured from Vite env vars. If the env is absent
// (e.g. local dev before Phase 1, or any deploy without the keys), `supabase`
// is null and `isAuthConfigured` is false — the app then runs WITHOUT the
// sign-in gate (current behaviour) so the live site never breaks before the
// backend is wired. Once VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set,
// sign-in becomes required automatically.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isAuthConfigured: boolean = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isAuthConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // handles the ?code=... OAuth callback automatically
        flowType: "pkce",
      },
    })
  : null;
