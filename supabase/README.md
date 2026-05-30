# Black Queen multiplayer — Supabase backend

Server-authoritative online play. Full plan in `docs/multiplayer_todo.md`.

## We're SHARING the "timi & jam" Supabase project

Supabase free tier caps you at 2 projects, so Black Queen reuses the existing
timi-and-jam project. That's fine:

- **No table collisions** — all our objects are prefixed `bq_` (their app uses
  `qa_`/`rps_`/etc.).
- **Shared Google OAuth + Auth** is already configured there, so we skip most of
  the auth setup. We only add Black Queen's URLs to the allow-lists.
- Our RLS is independent of their email allowlist; we only require a signed-in
  user and enforce per-hand secrecy.

## What's here

- `migrations/20260530000001_init.sql` — **Phase 2**: `bq_games`,
  `bq_game_players`, `bq_hands` (secret, own-row-only RLS), `bq_moves`.
- Edge Functions (**Phase 3**, not built yet): `bq-create-game`, `bq-join-game`,
  `bq-play`, etc. — import the pure reducer from `src/game/engine.ts`; the only
  things that write game tables.

---

## Step-by-step setup (shared project)

### 1. Get the shared project's URL + anon key
From timi-and-jam's Vercel env (or Supabase → Project Settings → API):
- **Project URL** → `https://<REF>.supabase.co`
- **anon public** key

### 2. Apply our migration to the shared project
Supabase dashboard → **SQL Editor → New query** → paste
`migrations/20260530000001_init.sql` → Run. (Only creates `bq_*` objects; leaves
timi-and-jam's tables untouched. Run once.)

Verify:
```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename like 'bq_%';
-- bq_games, bq_game_players, bq_hands, bq_moves → rowsecurity = true
```

### 3. Allow Black Queen's URL to sign in
- **Supabase → Authentication → URL Configuration → Redirect URLs:** add
  `https://black-queen.vercel.app/**` (and `http://localhost:5173/**` for dev).
  (Leave timi-and-jam's URLs as they are.)
- **Google Cloud Console → Credentials → (the existing OAuth client) →
  Authorized JavaScript origins:** add `https://black-queen.vercel.app`.
  The redirect URI (`https://<REF>.supabase.co/auth/v1/callback`) is already
  there — same project, no change.
- **Google Cloud → OAuth consent screen → Test users:** add the Google email of
  every person who will play Black Queen (it's in "Testing" mode, so only test
  users can sign in).

### 4. Add env vars to Black Queen's Vercel project
**Vercel → black-queen → Settings → Environment Variables** (Production +
Preview + Development) — note the `VITE_` prefix (Vite, not Next's NEXT_PUBLIC_):

| Key | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<REF>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the anon public key |

Then **Deployments → ⋯ → Redeploy**. The sign-in gate auto-activates.

### 5. Test
Visit `https://black-queen.vercel.app` → Single Player still works with no
sign-in. **Multiplayer → Host** → "Sign in with Google" → consent → back to the
menu signed in. (Host/Join stay "coming soon" until Phase 3 ships.)

---

## Next (Phase 3)
Once the migration is applied + sign-in works, tell Claude. It builds the Edge
Functions (`bq-create-game` / `bq-join-game` / `bq-play` …) that reuse
`engine.ts`, then the client online mode (subscribe to Realtime + read own hand).

## Gotchas
- **redirect_uri_mismatch** → the Google redirect URI must be the Supabase
  `/auth/v1/callback` (already configured for the shared project).
- **Can't sign in** → the Google account isn't a **test user** on the consent
  screen (step 3).
- **No sign-in prompt** → env vars missing or not redeployed; `VITE_` prefix
  required.
