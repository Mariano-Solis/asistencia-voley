-- Dedicated commercial Supabase project savptjiwzaypisayulwp only.
-- Reversible: drop the two DELETE triggers/function and three restrictive
-- policies below. Keep migration 009 guards in place independently.
begin;
do $$ begin
  if to_regclass('public.platform_owners') is null
    or to_regclass('public.attendance') is null
    or to_regclass('public.profiles') is not null
    or not exists (select 1 from pg_trigger where tgname='pilot_player_history_guard')
  then raise exception 'Expected commercial pilot with migration 009'; end if;
end $$;

create function public.pilot_guard_recorded_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'players' and exists (
    select 1 from public.attendance a
    where a.institution_id=old.institution_id and a.player_id=old.id
  ) then raise exception 'Deactivate a player with recorded attendance instead of deleting'; end if;
  if tg_table_name = 'training_sessions' and exists (
    select 1 from public.attendance a
    where a.institution_id=old.institution_id and a.session_id=old.id
  ) then raise exception 'Session with recorded attendance cannot be deleted'; end if;
  return old;
end $$;
revoke all on function public.pilot_guard_recorded_delete() from public;

create trigger pilot_player_recorded_delete before delete on public.players
  for each row execute function public.pilot_guard_recorded_delete();
create trigger pilot_session_recorded_delete before delete on public.training_sessions
  for each row execute function public.pilot_guard_recorded_delete();

-- The older permissive ALL policies still require own active membership.
-- These restrictive policies add an administrator requirement only on DELETE.
create policy pilot_players_delete_admin on public.players as restrictive
  for delete to authenticated using (public.pilot_member(institution_id,true));
create policy pilot_sessions_delete_admin on public.training_sessions as restrictive
  for delete to authenticated using (public.pilot_member(institution_id,true));
create policy pilot_attendance_delete_admin on public.attendance as restrictive
  for delete to authenticated using (public.pilot_member(institution_id,true));
commit;
