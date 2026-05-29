# Multiplayer — Handoff / Resume Point

**Single entry point to resume the online-multiplayer work from any computer.**
Last updated: 2026-05-28. Everything below is committed & pushed to `origin/main`.

---

## Resume from any computer

```bash
git clone https://github.com/Timothy-Cao/black-queen.git
cd black-queen            # the app lives at the repo ROOT (package.json is here)
npm install
npm run dev                # http://localhost:5173 — runs un-gated until Supabase env is set
npm run build              # sanity check (should pass)
```
Rust/WASM only needs rebuilding if you touch `rust/` (see CLAUDE.md). The committed WASM is current.

To resume the work with Claude, point it at **this file** and say which phase to start.

---

## Current state (DONE & shipped)

- ✅ **Main menu** (`/`): Single Player · Multiplayer → Host/Join · AI Notes · How to Play. (`src/components/MainMenu.tsx`)
- ✅ **Google SSO gate** + `AuthProvider` (`src/auth/AuthContext.tsx`, `src/lib/supabase.ts`, `src/components/SignIn.tsx`). Gate is **inactive until** `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set, then auto-enforced.
- ✅ **Multiplayer Host/Join screens** — UI shells only (`src/components/Multiplayer.tsx`); buttons disabled with a "coming soon" note. **No networking yet.**
- ✅ Single-player game fully works (offline, vs AI). AI = **hard-4 with tactical rollout** (the strongest validated config).
- ✅ Docs: `docs/multiplayer_todo.md` (full plan), `docs/auth_setup.md` (SSO setup), `.env.example`.

## Where we are = the resume point

**Backend does not exist yet.** Next real work is Supabase setup (YOU) → then server code (Claude). Multiplayer Host/Join are inert until that's done.

---

## YOUR action items (do in order; ask Claude to guide each)

1. **Create the Supabase project** → copy Project URL + anon key. *(detailed in auth_setup.md §2 / the chat Step 1)*
2. **Google OAuth** in Google Cloud Console (consent screen + Web client; authorized redirect URI = the *Supabase* callback `https://<ref>.supabase.co/auth/v1/callback`).
3. **Connect Google → Supabase** (paste client id/secret) + set **Redirect URLs** allow-list (your domain + `localhost:5173`).
4. **Add env vars to Vercel** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; Prod+Preview+Dev) → redeploy. Never add the service-role key client-side.
5. **Test sign-in** on the live site.

Full details: `docs/auth_setup.md`. Decisions are locked in `docs/multiplayer_todo.md` Phase 0.

**Decision (LOCKED 2026-05-28):** **everyone signs in with Google** (hosts + joiners). Every player gets an `auth.uid()` identity, which RLS needs for hand-secrecy. (Anonymous-joiner auth was the alt; not doing it for v1.)

---

## CLAUDE's action items (next build — do AFTER your Step 1, so it's testable)

Tell Claude: **"start Phase 2"** (or point it at this file). In order:

- **Phase 2 — Schema + RLS** (`games`, `game_players`, `hands`, `moves`; `hands` readable only by `auth.uid() = user_id`; no client writes to game tables). SQL migrations.
- **Phase 3 — Edge Functions** (`create_game`, `play_move`/`bid`/`declare`/`pass`) that import the existing pure `engine.ts` for server-authoritative deal + validation + scoring.
- **Phase 4 — Client online mode** (subscribe to Realtime public state, read own hand via RLS, send moves to Edge Functions; keep offline/practice mode unchanged).
- **Phase 5 — Rooms/presence** (wire the existing Host/Join shells: room codes, who's connected, AI-fill empty seats).
- **Phase 6 — AI seats online** (start with host-runs-AI; migrate to a server bot later).
- **Phase 7-8 — Reconnect/AI-takeover, anti-cheat hardening, tests, deploy.**

Why wait for your Step 1: Claude builds Phases 2-3 *against the real project* so the SQL + functions are tested, not a blind untested dump.

---

## Non-negotiable rules (anti-cheat) — for whoever builds the backend
- Deal + shuffle **server-side** (server RNG).
- Each client reads only its **own** hand (RLS-enforced; verify in the network tab).
- Every move **validated server-side** against `legalPlays` before applying.
- Clients never write game tables directly — only via Edge Functions (service role).

## Key facts to remember
- App lives in `repo/`. Manual routing (no react-router): `route` string + history API.
- `engine.ts` is a **pure reducer** → reused server-side in Edge Functions (Deno runs TS). Single source of truth.
- AI strength: hard-4 (tactical rollout) is strongest; greedy rollout was tried & reverted (matchup overfit). A real "Hard-5" would need learned inference — see `docs/hard5_literature_plan.md` (de-risked, not built).
- Bundle note: supabase-js pushed the JS bundle to ~540KB; fine for now, code-split later if desired.
