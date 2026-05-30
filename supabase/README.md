# Supabase backend (multiplayer)

Server-authoritative online play. See `docs/multiplayer_todo.md` for the full
plan and `docs/HANDOFF.md` for the resume point.

## What's here

- `migrations/20260530000001_init.sql` — **Phase 2**: schema + Row-Level
  Security for `games`, `game_players`, `hands` (secret, own-row-only), `moves`.
- Edge Functions (**Phase 3**, not built yet): `create_game`, `join_game`,
  `bid` / `pass` / `declare` / `play`. They import the pure reducer from
  `src/game/engine.ts` and are the ONLY thing that writes game tables.

## The secrecy model (why it's safe)

- Full state is reassembled server-side from `games.public_state` (no hands) +
  the per-seat rows in `hands`.
- RLS lets a client read only its **own** hand (`hands.user_id = auth.uid()`).
- Clients have **no write policies** on any game table. All mutations go through
  Edge Functions using the service-role key (which bypasses RLS).
- The deal + shuffle happen server-side; every move is validated by the reducer
  before being applied.

## Applying the migration

You need your Supabase project from the auth setup (`docs/auth_setup.md`). Pick one:

### Option A — Supabase CLI (recommended, version-controlled)

```bash
# one-time
npx supabase login
npx supabase link --project-ref <YOUR_PROJECT_REF>   # ref is in your project URL

# apply everything in supabase/migrations/
npx supabase db push
```

### Option B — Dashboard SQL editor (no CLI)

1. Supabase dashboard → **SQL Editor → New query**.
2. Paste the contents of `migrations/20260530000001_init.sql`.
3. Run. (Re-running is not idempotent — only run once on a fresh project.)

## Verify it worked

In the SQL editor:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- games, game_players, hands, moves should all show rowsecurity = true.
```

Realtime: **Database → Replication** should list `games`, `game_players`,
`hands` under the `supabase_realtime` publication.

## Next (Phase 3)

Once the migration is applied, tell Claude and it will build the Edge Functions
(`create_game` / `join_game` / `play` etc.) that reuse `engine.ts`, plus the
client online-mode that subscribes to Realtime and reads its own hand.
