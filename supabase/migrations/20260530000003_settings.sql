-- Black Queen multiplayer — host game settings (Phase 5)
-- turn_seconds: per-player time limit for human turns. NULL = unlimited.
alter table public.bq_games
  add column if not exists turn_seconds smallint;
