-- Black Queen — multiplayer schema + Row-Level Security (Phase 2)
--
-- Server-authoritative design:
--   * The full game state lives server-side. Clients read a PUBLIC projection
--     (no hands) plus their OWN hand only.
--   * Every game-table write happens through Edge Functions using the
--     service-role key (which bypasses RLS). Clients have NO write policies.
--
-- Reassembling authoritative state server-side = games.public_state (everything
-- except hands) + the per-seat rows in `hands`. The pure reducer in
-- src/game/engine.ts runs in the Edge Function against that reconstructed state.

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ───────────────────────────── games ──────────────────────────────────────
create table public.games (
  id           uuid primary key default gen_random_uuid(),
  room_code    text not null unique,
  host_user_id uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'lobby'
                 check (status in ('lobby', 'playing', 'done')),
  -- Public-safe projection of the engine GameState (NO hands): phase, trump,
  -- caller, whose turn, the trick on the table, bids, captured points, scores,
  -- revealed partner info, etc. Everything a client renders. Written only by
  -- Edge Functions. (`round.passed` is serialized as an array, not a Set.)
  public_state jsonb   not null default '{}'::jsonb,
  -- Optimistic-concurrency guard, bumped on each applied move.
  version      integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index games_room_code_idx on public.games (room_code);

-- ────────────────────────── game_players ──────────────────────────────────
create table public.game_players (
  game_id        uuid     not null references public.games (id) on delete cascade,
  seat           smallint not null check (seat between 0 and 4),
  user_id        uuid     references auth.users (id) on delete set null,  -- null = AI
  is_ai          boolean  not null default false,
  ai_personality text,                                   -- e.g. 'hard-4' for AI seats
  display_name   text     not null,
  connected      boolean  not null default true,
  last_seen      timestamptz not null default now(),
  primary key (game_id, seat)
);
create index game_players_user_idx on public.game_players (user_id);
-- A human can occupy at most one seat per game.
create unique index game_players_one_seat_per_user
  on public.game_players (game_id, user_id) where user_id is not null;

-- ───────────────────────────── hands (SECRET) ─────────────────────────────
create table public.hands (
  game_id uuid     not null references public.games (id) on delete cascade,
  seat    smallint not null check (seat between 0 and 4),
  user_id uuid     references auth.users (id) on delete set null,  -- null = AI
  cards   jsonb    not null default '[]'::jsonb,   -- array of { suit, rank, id }
  primary key (game_id, seat)
);
create index hands_user_idx on public.hands (user_id);

-- ─────────────────────── moves (append-only audit log) ────────────────────
create table public.moves (
  id         bigint generated always as identity primary key,
  game_id    uuid     not null references public.games (id) on delete cascade,
  seat       smallint not null,
  type       text     not null check (type in ('bid', 'pass', 'declare', 'play')),
  payload    jsonb    not null default '{}'::jsonb,
  version    integer  not null,            -- games.version this move produced
  created_at timestamptz not null default now()
);
create index moves_game_idx on public.moves (game_id, id);

-- ──────────────────────────── updated_at trigger ──────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger games_touch
  before update on public.games
  for each row execute function public.touch_updated_at();

-- ──────────────────────────── membership helper ───────────────────────────
-- SECURITY DEFINER so the games SELECT policy can check membership without
-- triggering recursive RLS on game_players.
create or replace function public.is_game_member(g uuid)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.game_players gp
    where gp.game_id = g and gp.user_id = auth.uid()
  );
$$;

-- ───────────────────────────────── RLS ────────────────────────────────────
alter table public.games        enable row level security;
alter table public.game_players enable row level security;
alter table public.hands        enable row level security;
alter table public.moves        enable row level security;

-- games: members may read public state. (Joining a room happens via a
-- service-role Edge Function, so non-members never need direct SELECT.)
create policy games_select_member on public.games
  for select to authenticated using (public.is_game_member(id));

-- game_players: members may read the roster.
create policy game_players_select_member on public.game_players
  for select to authenticated using (public.is_game_member(game_id));

-- hands: a player may read ONLY their own hand. This is the core secrecy rule.
create policy hands_select_own on public.hands
  for select to authenticated using (user_id = auth.uid());

-- moves: members may read the log.
create policy moves_select_member on public.moves
  for select to authenticated using (public.is_game_member(game_id));

-- NOTE: there are deliberately NO insert/update/delete policies. Clients cannot
-- write any game table. Edge Functions use the service-role key (bypasses RLS).

-- ──────────────────────────────── Realtime ────────────────────────────────
-- Clients subscribe to public state, roster, and their own hand (RLS-filtered,
-- so each client receives only its own hands row).
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.game_players;
alter publication supabase_realtime add table public.hands;
