# Google SSO setup — Vercel + Supabase + Google Cloud

What the code already does (shipped): a `MainMenu`, a `SignIn` gate, and an
`AuthProvider`. The gate is **enforced only when** `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are present. Until you finish the steps below, the live
site runs un-gated (current behaviour). Once the env vars are set in Vercel,
sign-in becomes **required** automatically — no code change needed.

## How the OAuth flow works (so the config makes sense)

1. User clicks **Sign in with Google** → `supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: <app origin>/ })`.
2. Browser → Google consent screen.
3. Google redirects to **Supabase's** callback: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`.
4. Supabase finishes the exchange, then redirects back to **our app origin** with `?code=...` (PKCE).
5. `supabase-js` (`detectSessionInUrl`) swaps the code for a session on load; `onAuthStateChange` fires; the gate opens.

Two different redirect settings matter, don't mix them up:
- **Google Cloud → authorized redirect URI** = the **Supabase** callback URL (step 3).
- **Supabase → redirect allow-list** = **our app** URLs (step 4).

---

## 1. Google Cloud Console

1. Go to <https://console.cloud.google.com> → create/select a project.
2. **APIs & Services → OAuth consent screen**:
   - User type: **External**. Fill app name ("Black Queen"), support email, developer email.
   - Scopes: the defaults (email, profile, openid) are enough.
   - While testing you can leave it in "Testing" and add your Google account as a test user; **Publish** it before public launch (otherwise only test users can sign in).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins:** your app origins —
     `https://<your-domain>` (prod), and `http://localhost:5173` (dev).
   - **Authorized redirect URIs:** the **Supabase** callback —
     `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
     (get `<PROJECT_REF>` from Supabase → Project Settings → it's in the project URL).
   - Save → copy the **Client ID** and **Client secret**.

## 2. Supabase

1. Create a project (Phase 1) if not done. Note the **Project URL** (`https://<PROJECT_REF>.supabase.co`) and **anon public key** (Project Settings → API).
2. **Authentication → Providers → Google**: enable it; paste the **Client ID** + **Client secret** from step 1; save.
3. **Authentication → URL Configuration:**
   - **Site URL:** your production URL, e.g. `https://<your-domain>`.
   - **Redirect URLs** (allow-list — add each):
     - `https://<your-domain>/`
     - `https://<your-domain>` (no trailing slash too, to be safe)
     - `http://localhost:5173/` (local dev)
     - Vercel previews (optional): `https://*-<your-team>.vercel.app/` or add specific preview URLs as needed.
4. (Later, for multiplayer) we'll add DB tables + RLS + Edge Functions — see `docs/multiplayer_todo.md`.

## 3. Vercel

1. Project → **Settings → Environment Variables**, add (Production + Preview + Development):
   - `VITE_SUPABASE_URL` = `https://<PROJECT_REF>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the anon public key
   - (Do **NOT** add the service-role key here — it's server-only, used later in Edge Function secrets.)
2. Redeploy (env vars only take effect on a new build). The Vite var names MUST start with `VITE_` to be exposed to the client.
3. Confirm your production domain matches what you put in Supabase Site URL / Google origins.

## 4. Local dev (optional)

Create `.env.local` at the repo root (gitignored):
```
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```
`npm run dev` then exercises the real sign-in flow at `http://localhost:5173`.

---

## Verify it works
- Visit the site → you should see the **Sign in with Google** screen (only once env is set).
- Sign in → redirected to Google → back to the app → lands on the **Main Menu** with "Signed in as <email>".
- Sign out (bottom of the menu) returns you to the sign-in screen.

## Common gotchas
- **"redirect_uri_mismatch"** → the Google authorized redirect URI must be the **Supabase** `/auth/v1/callback`, exactly.
- **Stuck on a blank page after Google** → the app origin isn't in Supabase's Redirect URLs allow-list.
- **Gate not appearing** → env vars missing or build not redeployed; `VITE_` prefix required.
- **Only test users can log in** → publish the OAuth consent screen.
