-- Dedicated commercial project only. Preserve the tenant and recorded attendance history.
-- Additive/reversible: drop the six triggers, two functions and optional index to revert.
begin;
do $$ begin
  if to_regclass('public.platform_owners') is null
     or to_regclass('public.attendance') is null
     or to_regclass('public.profiles') is not null then
    raise exception 'Expected dedicated commercial pilot schema';
  end if;
end $$;

create function public.pilot_guard_sports_tenant() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.institution_id is distinct from old.institution_id then
    raise exception 'Institution cannot be changed';
  end if;
  return new;
end $$;

create function public.pilot_guard_recorded_category() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.category_id is distinct from old.category_id then
    if tg_table_name = 'players' and exists (
      select 1 from public.attendance a
      where a.institution_id = old.institution_id and a.player_id = old.id
    ) then raise exception 'Player with recorded attendance cannot change category'; end if;
    if tg_table_name = 'training_sessions' and exists (
      select 1 from public.attendance a
      where a.institution_id = old.institution_id and a.session_id = old.id
    ) then raise exception 'Session with recorded attendance cannot change category'; end if;
  end if;
  return new;
end $$;
revoke all on function public.pilot_guard_sports_tenant(), public.pilot_guard_recorded_category() from public;

create trigger pilot_categories_tenant_guard before update of institution_id on public.categories
  for each row execute function public.pilot_guard_sports_tenant();
create trigger pilot_players_tenant_guard before update of institution_id on public.players
  for each row execute function public.pilot_guard_sports_tenant();
create trigger pilot_sessions_tenant_guard before update of institution_id on public.training_sessions
  for each row execute function public.pilot_guard_sports_tenant();
create trigger pilot_attendance_tenant_guard before update of institution_id on public.attendance
  for each row execute function public.pilot_guard_sports_tenant();
create trigger pilot_player_history_guard before update of category_id on public.players
  for each row execute function public.pilot_guard_recorded_category();
create trigger pilot_session_history_guard before update of category_id on public.training_sessions
  for each row execute function public.pilot_guard_recorded_category();

create index if not exists pilot_attendance_player_lookup
  on public.attendance(institution_id,player_id);
commit;
