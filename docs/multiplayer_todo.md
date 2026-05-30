# Online Multiplayer — Setup TODO

**Status:** planning. **Created:** 2026-05-28. Target stack: **Supabase** (Postgres + Realtime + Auth + Edge Functions) on the existing Vite + React + TS app, deployed on Vercel.

Inspiration: indie web games (Supabase Realtime is the common "no dedicated server" pattern — broadcast/presence/postgres-changes over WebSockets). See refs at bottom.

---

## ⚠ The one design constraint that drives everything

Black Queen is a **hidden-information** game (each player's 13-card hand is secret; the partner is hidden). Therefore:

- **State must be server-authoritative.** Clients cannot be trusted to hold or validate the full game state — a cheater could read opponents' hands or play illegal/nonexistent cards.
- **Per-hand secrecy via Row-Level Security (RLS):** each client may read ONLY its own hand + public info (trick on table, whose turn, scores, bids). Never all hands.
- **Moves validated server-side** before being applied.

**Key asset:** `src/game/engine.ts` is already a **pure reducer**. Supabase Edge Functions run TypeScript (Deno), so the *same* `engine.ts` runs server-side as the authority — single source of truth, no logic rewrite. The client keeps engine.ts only for optimistic rendering + offline-vs-AI practice mode.

---

## Architecture (recommended)

```
Client (React)                         Supabase
  ├─ subscribe: Realtime on            ┌─ Postgres
  │   public game state  ───────────►  │   ├─ games        (room, phase, trump, caller, turn, trick, scores)
  │                                    │   ├─ game_players (seat, user_id, is_ai, connected)
  ├─ read: my hand (RLS) ───────────►  │   ├─ hands        (game_id, user_id, cards[])  ← RLS: own row only
  │                                    │   └─ moves        (append-only log; optional event-sourcing)
  └─ POST move ──► Edge Function ────► │─ Edge Fn `play_move` (Deno)
                   (validates w/        │     imports engine.ts, validates legality,
                    engine.ts,          │     applies reducer, writes new state + hands,
                    applies, writes)    │     advances turn / triggers AI seat
                                        └─ Auth (anonymous or magic-link)
```

- **Public state** (`games` row) → readable by anyone in the room → Realtime pushes updates to all clients.
- **Secret hands** (`hands` rows) → RLS `auth.uid() = user_id` → each client reads only its own.
- **All mutations** go through Edge Functions (or Postgres RPC) that import `engine.ts`. Clients never write game tables directly.

---

## Phase 0 — Decisions (YOU)

**DECISIONS LOCKED (2026-05-28):**

- [x] **Auth:** **Google SSO** to create a lobby (no passwords — access is always by room code).
- [x] **Matchmaking:** **room codes** (shareable, no password).
- [x] **Empty seats:** **filled with AI** (hard-4).
- [x] **Disconnect policy:** **disconnector replaced by AI** (AI takes over the seat).
- [x] **Scope of v1:** single game per room (matches current single-game model).
- [ ] Confirm Supabase **free tier** is fine for launch (200 concurrent realtime connections, 500K edge fn invocations/mo — plenty for early users).

- [x] **Do JOINERS sign in too? → YES. Everyone (hosts + joiners) signs in with Google for v1.** (LOCKED 2026-05-28.) RLS hand-secrecy requires every player to have an `auth.uid()` identity; universal Google sign-in is the simplest way to guarantee it. Anonymous-joiner auth was the lower-friction alt — deferred, can add later.

**DECISIONS ADDED 2026-05-30 (shared Supabase project + open sign-in):**

- [x] **Shared Supabase project** with the `timi-and-jam` app (free-tier 2-project cap). Our objects are all prefixed `bq_`. Verified safe: timi-and-jam gates every table with `current_user_allowed()` (email allowlist), so random Black Queen users cannot touch their data; our `bq_` RLS (own-hand-only, member reads, no client writes) protects ours.
- [x] **Open sign-in:** any Google account may play (publish the shared OAuth consent screen). Not a data risk given the two RLS walls above. Branding caveat: the consent screen shows "Timi & Jam" (one shared OAuth client).
- [x] **Abuse caps (enforced server-side in Edge Functions):**
  - Max **3 concurrent games** (`status in ('lobby','playing')`); `create_game` rejects beyond that.
  - **Empty-lobby teardown:** when the last *human* leaves a game, delete the `bq_games` row (cascades to hands/players/moves).
  - **AFK handling:** idle past a timeout → in a running game, the seat is taken over by AI; in a lobby, the player is removed. (Aligns with the existing "disconnector replaced by AI" decision.)

## Phase 1 — Supabase project setup (YOU)

- [ ] Create a Supabase project (note the region — pick closest to most users).
- [ ] Grab `SUPABASE_URL` and `SUPABASE_ANON_KEY` (public) and `SERVICE_ROLE_KEY` (secret — server only).
- [ ] Add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` to Vercel env vars (and `.env.local` for dev). Service-role key goes ONLY in Edge Function secrets, never client.
- [ ] Enable Realtime on the `games` (and `game_players`) tables.
- [ ] Enable **Google** auth provider in the Supabase dashboard: create a Google OAuth client (Google Cloud Console → OAuth consent screen + credentials), set the Supabase callback URL as an authorized redirect URI, paste the client ID/secret into Supabase Auth → Providers → Google. (If allowing anonymous joiners later, also enable Anonymous sign-ins.)
- [ ] Add the production domain + Vercel preview URLs to Supabase Auth → URL Configuration (redirect allow-list).

## Phase 2 — Schema + RLS (ME)

- [ ] Write SQL migrations: `games`, `game_players`, `hands`, `moves` tables (schema above).
- [ ] RLS policies: `hands` → `auth.uid() = user_id` for SELECT; game tables → members of the game can SELECT public columns; **no client INSERT/UPDATE** on game state (only via service-role in Edge Fns).
- [ ] Indexes on `game_id`, room code lookup.
- [ ] Seed/test data + a script to spin a test game.

## Phase 3 — Server-authoritative game logic (ME)

- [ ] Make `engine.ts` importable by Deno (it's pure already; verify no browser-only deps — it's clean).
- [ ] Edge Function `create_game` — make room, deal hands server-side (RNG server-side!), write `hands` + initial public state.
- [ ] Edge Function `play_move` (and `bid`, `declare`, `pass`) — load state, validate legality via `legalPlays`/reducer, apply, persist new public state + updated hands, advance turn. Reject illegal/out-of-turn moves.
- [ ] Trick collection + scoring server-side (reuse `collectTrick`, scoring).
- [ ] Concurrency: guard against double-submits / race (optimistic version column or row lock).

## Phase 4 — Client refactor (ME)

The app currently drives the whole game locally via the `App.tsx` state machine. Refactor to a **two-mode** client:

- [ ] **Online mode:** subscribe to Realtime public state + read own hand via RLS; render from *server* state; send moves to Edge Functions; show optimistic UI then reconcile.
- [ ] **Offline/practice mode:** keep the current local engine + AI exactly as-is (no regression — important for solo play and as a fallback).
- [ ] Supabase client setup (`@supabase/supabase-js`), auth bootstrap, reconnect handling.
- [ ] Loading/turn/waiting-for-players UI states.

## Phase 5 — Lobby & rooms (ME + YOU)

- [ ] Create/join-by-code UI (extend existing `Lobby.tsx`).
- [ ] Presence (Supabase Realtime presence): show who's connected, seat assignment, ready-up.
- [ ] Start-game gate (host starts; fill remaining seats with AI per Phase 0 decision).
- [ ] YOU: copy/share-link UX, basic styling pass.

## Phase 6 — AI seats in multiplayer (ME)

- [ ] Decide where AI runs: (a) Edge Function invokes hard-4 — but hard-4 is Rust/**WASM**; running WASM in Deno edge is feasible but heavier; (b) a lightweight **bot worker** (a small Node/Deno process or scheduled function) that polls for AI turns and submits moves; (c) host-client runs AI for empty seats (simplest, but ties AI to host being online).
- [ ] Recommend starting with **(c) host-runs-AI** for v1 (reuses existing WASM path, zero new infra), migrate to (b) a server bot if hosts dropping is a problem.
- [ ] Ensure AI only ever sees its own hand (same secrecy rule) — trivial if host runs it with full state, but if server-side, feed it only the legal info.

## Phase 7 — Resilience & anti-cheat hardening (ME + YOU)

- [ ] Reconnect: client re-subscribes and re-reads state on drop; server tolerates.
- [ ] Timeout → AI takeover for idle/disconnected players.
- [ ] Rate-limit Edge Functions; validate every move belongs to the acting player.
- [ ] Never send hidden hands in any public payload (audit network responses).

## Phase 8 — Test, deploy, monitor (ME + YOU)

- [ ] Integration tests for the Edge Functions (legal-move enforcement, secrecy, full-game flow).
- [ ] Multi-tab / multi-device manual playtests.
- [ ] Deploy Edge Functions; wire Vercel env; smoke a real online game.
- [ ] Basic logging/metrics (active rooms, errors), watch free-tier usage.

---

## Suggested ordering & effort

1. Phase 0 (you, ~30 min of decisions) → unblocks everything.
2. Phase 1 (you, ~30 min).
3. Phases 2–3 (me, the authoritative core — biggest correctness work).
4. Phase 4 (me, biggest client work).
5. Phases 5–6 (rooms + AI).
6. Phases 7–8 (hardening + ship).

A thin **vertical slice** is the best first milestone: room code → 2 humans + 3 AI → one full game end-to-end, server-authoritative, hands secret. Get that working before polishing lobby/presence.

## Hard rules (anti-cheat) — non-negotiable
- Deal + shuffle happen **server-side** with server RNG.
- A client can read only its **own** hand (RLS-enforced, verified in the network tab).
- Every move is **validated server-side** against `legalPlays` before applying.
- Clients never write game tables directly — only via Edge Functions using the service role.

## References
- [Supabase Realtime: Multiplayer Edition](https://supabase.com/blog/supabase-realtime-multiplayer-general-availability)
- [Supabase Realtime with Multiplayer Features](https://supabase.com/blog/supabase-realtime-with-multiplayer-features)
- [Real-time multiplayer browser game with Supabase + Next.js (no backend server)](https://dev.to/iakabu/i-built-a-real-time-multiplayer-browser-game-with-supabase-nextjs-no-backend-server-required-h28)
- [Exploring Supabase Realtime by Building a Game](https://www.aleksandra.codes/supabase-game)
