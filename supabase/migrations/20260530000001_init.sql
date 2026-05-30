-- Black Queen — multiplayer schema + Row-Level Security (Phase 2)
--
-- NOTE: this database is SHARED with the "timi & jam" app, so every object is
-- prefixed `bq_` to avoid collisions (their tables use qa_/rps_/etc.). Our RLS
-- is independent of their allowlist (`current_user_allowed()`); we only require
-- a signed-in user and enforce per-hand secrecy.
--
-- Server-authoritative design:
--   * The full game state lives server-side. Clients read a PUBLIC projection
--     (no hands) plus their OWN hand only.
--   * Every game-table write happens through Edge Functions using the
--     service-role key (which bypasses RLS). Clients have NO write policies.
--
-- Authoritative state is reassembled server-side = bq_games.public_state
-- (everything except hands) + the per-seat rows in bq_hands. The pure reducer
-- in src/game/engine.ts runs in the Edge Function against that state.

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ───────────────────────────── bq_games ───────────────────────────────────
create table public.bq_games (
  id           uuid primary key default gen_random_uuid(),
  room_code    text not null unique,
  host_user_id uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'lobby'
                 check (status in ('lobby', 'playing', 'done')),
  -- Public-safe projection of the engine GameState (NO hands): phase, trump,
  -- caller, whose turn, the trick on the table, bids, captured points, scores,
  -- revealed partner info, etc. Written only by Edge Functions.
  -- (`round.passed` is serialized as an array, not a Set.)
  public_state jsonb   not null default '{}'::jsonb,
  version      integer not null default 0,   -- optimistic-concurrency guard
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index bq_games_room_code_idx on public.bq_games (room_code);

-- ─────────────────────────── bq_game_players ──────────────────────────────
create table public.bq_game_players (
  game_id        uuid     not null references public.bq_games (id) on delete cascade,
  seat           smallint not null check (seat between 0 and 4),
  user_id        uuid     references auth.users (id) on delete set null,  -- null = AI
  is_ai          boolean  not null default false,
  ai_personality text,                                   -- e.g. 'hard-4' for AI seats
  display_name   text     not null,
  connected      boolean  not null default true,
  last_seen      timestamptz not null default now(),
  primary key (game_id, seat)
);
create index bq_game_players_user_idx on public.bq_game_players (user_id);
create unique index bq_game_players_one_seat_per_user
  on public.bq_game_players (game_id, user_id) where user_id is not null;

-- ───────────────────────────── bq_hands (SECRET) ──────────────────────────
create table public.bq_hands (
  game_id uuid     not null references public.bq_games (id) on delete cascade,
  seat    smallint not null check (seat between 0 and 4),
  user_id uuid     references auth.users (id) on delete set null,  -- null = AI
  cards   jsonb    not null default '[]'::jsonb,   -- array of { suit, rank, id }
  primary key (game_id, seat)
);
create index bq_hands_user_idx on public.bq_hands (user_id);

-- ─────────────────────── bq_moves (append-only audit log) ──────────────────
create table public.bq_moves (
  id         bigint generated always as identity primary key,
  game_id    uuid     not null references public.bq_games (id) on delete cascade,
  seat       smallint not null,
  type       text     not null check (type in ('bid', 'pass', 'declare', 'play')),
  payload    jsonb    not null default '{}'::jsonb,
  version    integer  not null,            -- bq_games.version this move produced
  created_at timestamptz not null default now()
);
create index bq_moves_game_idx on public.bq_moves (game_id, id);

-- ──────────────────────────── updated_at trigger ──────────────────────────
create or replace function public.bq_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bq_games_touch
  before update on public.bq_games
  for each row execute function public.bq_touch_updated_at();

-- ──────────────────────────── membership helper ───────────────────────────
-- SECURITY DEFINER so the bq_games SELECT policy can check membership without
-- triggering recursive RLS on bq_game_players.
create or replace function public.bq_is_game_member(g uuid)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.bq_game_players gp
    where gp.game_id = g and gp.user_id = auth.uid()
  );
$$;

-- ───────────────────────────────── RLS ────────────────────────────────────
alter table public.bq_games        enable row level security;
alter table public.bq_game_players enable row level security;
alter table public.bq_hands        enable row level security;
alter table public.bq_moves        enable row level security;

-- bq_games: members may read public state. (Joining a room happens via a
-- service-role Edge Function, so non-members never need direct SELECT.)
create policy bq_games_select_member on public.bq_games
  for select to authenticated using (public.bq_is_game_member(id));

-- bq_game_players: members may read the roster.
create policy bq_game_players_select_member on public.bq_game_players
  for select to authenticated using (public.bq_is_game_member(game_id));

-- bq_hands: a player may read ONLY their own hand. The core secrecy rule.
create policy bq_hands_select_own on public.bq_hands
  for select to authenticated using (user_id = auth.uid());

-- bq_moves: members may read the log.
create policy bq_moves_select_member on public.bq_moves
  for select to authenticated using (public.bq_is_game_member(game_id));

-- NOTE: there are deliberately NO insert/update/delete policies. Clients cannot
-- write any game table. Edge Functions use the service-role key (bypasses RLS).

-- ──────────────────────────────── Realtime ────────────────────────────────
-- Clients subscribe to public state, roster, and their own hand (RLS-filtered,
-- so each client receives only its own bq_hands row).
alter publication supabase_realtime add table public.bq_games;
alter publication supabase_realtime add table public.bq_game_players;
alter publication supabase_realtime add table public.bq_hands;
