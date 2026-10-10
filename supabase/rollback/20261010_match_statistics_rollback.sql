-- ROLLBACK DE EMERGENCIA · ESTADÍSTICAS DE PARTIDO
-- NO ejecutar automáticamente. Es destructivo y elimina estadísticas ya cargadas.
-- Usar sólo si se decide volver exactamente al estado anterior al módulo.

drop policy if exists "match stat events managers delete" on public.match_stat_events;
drop policy if exists "match stat events managers insert" on public.match_stat_events;
drop policy if exists "match stat events players select own" on public.match_stat_events;
drop policy if exists "match stat events managers select" on public.match_stat_events;
drop policy if exists "match stat sessions managers delete" on public.match_stat_sessions;
drop policy if exists "match stat sessions managers update" on public.match_stat_sessions;
drop policy if exists "match stat sessions managers insert" on public.match_stat_sessions;
drop policy if exists "match stat sessions players select own" on public.match_stat_sessions;
drop policy if exists "match stat sessions managers select" on public.match_stat_sessions;

drop table if exists public.match_stat_events;
drop table if exists public.match_stat_sessions;

drop function if exists public.player_owns_match_stat_session(uuid);
drop function if exists public.can_manage_match_stat_session(uuid);
drop function if exists public.player_can_view_match_stats();
drop function if exists public.can_manage_match_stats(uuid);

alter table public.profiles drop column if exists can_manage_match_stats;
alter table public.app_ui_settings drop column if exists player_can_view_match_stats;
