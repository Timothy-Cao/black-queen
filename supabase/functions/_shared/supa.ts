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

export interface Caller { id: string; email: string | null; }

/** Resolve the calling user (id + email) from Authorization: Bearer <jwt>. */
export async function getUser(req: Request): Promise<Caller | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const scoped = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await scoped.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/** Resolve just the caller's user id (auth.uid) or null. */
export async function getUserId(req: Request): Promise<string | null> {
  return (await getUser(req))?.id ?? null;
}

/** True if the email is in the ADMIN_EMAILS secret (comma-separated). */
export function isAdmin(email: string | null): boolean {
  if (!email) return false;
  const list = (Deno.env.get("ADMIN_EMAILS") ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}
