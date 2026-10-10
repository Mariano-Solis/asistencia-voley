-- Cinturón de seguridad: este módulo sólo registra estadísticas institucionales de MSM.
alter table public.match_stat_sessions
  drop constraint if exists match_stat_sessions_our_team_msm_check;

alter table public.match_stat_sessions
  add constraint match_stat_sessions_our_team_msm_check
  check (upper(trim(our_team)) like 'MSM%');
