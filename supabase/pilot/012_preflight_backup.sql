-- Dedicated commercial project only. Capture the current sports rows before
-- the additive 012–014 migrations. This private schema is not exposed by API.
begin;
do $$ begin
  if to_regclass('public.platform_owners') is null
    or to_regclass('public.profiles') is not null
    or to_regclass('public.player_private_details') is not null
    or to_regclass('pilot_backups.c15_categories_before_012') is not null
  then raise exception 'Unexpected project or C15 backup already present'; end if;
end $$;
create schema if not exists pilot_backups;
revoke all on schema pilot_backups from public, anon, authenticated;
create table pilot_backups.c15_categories_before_012 as table public.categories;
create table pilot_backups.c15_players_before_012 as table public.players;
create table pilot_backups.c15_sessions_before_012 as table public.training_sessions;
create table pilot_backups.c15_attendance_before_012 as table public.attendance;
revoke all on all tables in schema pilot_backups from public, anon, authenticated;
do $$ begin
  if (select count(*) from pilot_backups.c15_categories_before_012) <> (select count(*) from public.categories)
    or (select count(*) from pilot_backups.c15_players_before_012) <> (select count(*) from public.players)
    or (select count(*) from pilot_backups.c15_sessions_before_012) <> (select count(*) from public.training_sessions)
    or (select count(*) from pilot_backups.c15_attendance_before_012) <> (select count(*) from public.attendance)
  then raise exception 'Backup count mismatch'; end if;
end $$;
commit;
