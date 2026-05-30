// Supabase client — lazily code-split. The heavy `@supabase/supabase-js` bundle
// (~200KB) is loaded via a dynamic import ONLY when auth is configured and the
// client is first needed. When env vars are absent (current live site, and any
// single-player-only user), supabase-js is never downloaded at all.
//
// `import type` below is erased at build time — no runtime dependency, so it
// does NOT pull supabase-js into the main chunk.
import type { SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isAuthConfigured: boolean = Boolean(url && anonKey);

let clientPromise: Promise<SupabaseClient | null> | null = null;

/** Resolve the Supabase client (null if unconfigured). Memoized; triggers the
 *  dynamic import on first call. */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!isAuthConfigured) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(url!, anonKey!, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // We exchange the ?code=... ourselves in AuthContext so errors are
          // visible and we avoid a double-exchange race.
          detectSessionInUrl: false,
          flowType: "pkce",
        },
      }),
    );
  }
  return clientPromise;
}
