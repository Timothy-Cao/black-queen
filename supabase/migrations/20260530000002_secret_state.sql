-- Black Queen multiplayer — authoritative secret state (Phase 3)
--
-- The full engine GameState contains hidden info the public projection must NOT
-- leak: every hand, AND `round.partners` (who the hidden partners are, fixed at
-- declare time and revealed only incrementally via `revealedPartners`).
--
-- RLS is row-level, not column-level, so we can't hide a column on bq_games.
-- Instead the full authoritative state lives in this separate table with NO
-- client read policy — only the service role (Edge Functions) can touch it.
-- Clients still read bq_games.public_state (redacted) + their own bq_hands row.

create table public.bq_game_secrets (
  game_id uuid primary key references public.bq_games (id) on delete cascade,
  -- Full serialized GameState (round.passed stored as an array, not a Set).
  state   jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.bq_game_secrets enable row level security;
-- No policies at all → no client (anon/authenticated) can read or write.
-- The service role used by Edge Functions bypasses RLS.
