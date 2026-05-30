// Supabase admin client (service role — bypasses RLS) + caller identity helper.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// These env vars are injected automatically into every Edge Function.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/** Service-role client: full DB access, bypasses RLS. Server-only. */
export function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Resolve the calling user from the request's Authorization: Bearer <jwt>.
 *  Returns the user id (auth.uid) or null if unauthenticated. */
export async function getUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  // A client scoped to the caller's JWT lets us validate + read the user.
  const scoped = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await scoped.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}
