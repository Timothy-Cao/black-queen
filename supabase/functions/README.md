# Black Queen Edge Functions (Phase 3)

Server-authoritative game logic. The pure reducer is vendored from
`src/game/*` into `_shared/engine/` (regenerate with
`node supabase/functions/_shared/sync-engine.mjs` after engine changes).

## Functions

| Function | Body | Does |
|---|---|---|
| `bq-create-game` | `{ displayName }` | New lobby (host = seat 0). Enforces the **max-3-games** cap. |
| `bq-join-game` | `{ roomCode, displayName }` | Join a lobby, take the next free seat. |
| `bq-start-game` | `{ gameId, aiPersonality?, shuffleIntensity? }` | Host-only. Fill empty seats with AI, deal server-side, begin. |
| `bq-move` | `{ gameId, action }` | Validate it's your turn + the move is legal, apply, run AI + collect tricks. |
| `bq-leave-game` | `{ gameId }` | Lobby: free the seat. In-game: **AI takes over**. Humanless game → destroyed. |

`action` = `{type:"bid",amount}` | `{type:"pass"}` | `{type:"declare",trump,partnerCard}` | `{type:"play",card}`

## State model
- `bq_game_secrets.state` — full authoritative state (server-only; no RLS read).
- `bq_games.public_state` — redacted (no hands, no hidden partners) for clients.
- `bq_hands` — per-seat current hand, RLS-delivered to its owner.

## Deploy

Requires the migrations applied first (`supabase/migrations/`).

```bash
npx supabase functions deploy bq-create-game --no-verify-jwt
npx supabase functions deploy bq-join-game   --no-verify-jwt
npx supabase functions deploy bq-start-game  --no-verify-jwt
npx supabase functions deploy bq-move        --no-verify-jwt
npx supabase functions deploy bq-leave-game  --no-verify-jwt
```

> `--no-verify-jwt` because each function validates the caller's JWT itself
> (`getUserId`) and must also answer the browser's unauthenticated CORS
> preflight (`OPTIONS`). Auth is still enforced — an unsigned request gets 401.

No extra secrets needed: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` are injected into every function automatically.

## v1 limitations (next iterations)
- **Server AI is trivial** (passes in bidding, random legal plays). Upgrade by
  vendoring `aiHard.ts` (Hard-3) or calling the Rust/WASM Hard-4 here.
- **Tricks auto-collect instantly** — add a brief server-side reveal delay so
  clients can see the completed trick.
- **AFK timeout** isn't automatic yet (leave is explicit). Add a scheduled
  function or a per-turn deadline that calls the takeover path.
