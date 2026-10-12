alter table public.match_stat_sessions
  add column if not exists lineup_jersey_numbers jsonb not null default '{}'::jsonb;

comment on column public.match_stat_sessions.lineup_jersey_numbers is
  'Map player UUID -> jersey number used for this match/stat session.';
