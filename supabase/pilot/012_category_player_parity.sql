-- STAGED ONLY: apply to the dedicated commercial project after checking its
-- schema, backing up its current rows and validating the rollback below.
-- This migration does not touch the historical San Martín database.
begin;
do $$ begin
  if to_regclass('public.platform_owners') is null
    or to_regclass('public.profiles') is not null
    or to_regclass('public.categories') is null
    or to_regclass('public.players') is null
    or not exists (select 1 from pg_trigger where tgname = 'pilot_player_history_guard')
  then raise exception 'Expected isolated commercial schema with history guards'; end if;
end $$;

alter table public.categories
  add column gender text check (gender in ('female','male')),
  add column active boolean not null default true;
alter table public.players
  add column first_name text check (first_name is null or length(btrim(first_name)) between 1 and 80),
  add column last_name text check (last_name is null or length(btrim(last_name)) between 1 and 80),
  add column sex text check (sex in ('female','male')),
  add column dni text check (dni is null or dni ~ '^[0-9]{6,12}$'),
  add column birth_date date check (birth_date is null or birth_date <= current_date),
  add column team text check (team is null or length(btrim(team)) between 1 and 40),
  add column category_override boolean not null default false;

-- An existing row with no recorded branch keeps its original category. A
-- new assignment to a known branch must match; an inactive category cannot
-- accept a new player. Historical attendance/category guards still apply.
create function public.pilot_validate_player_branch() returns trigger
language plpgsql set search_path = '' as $$
declare target_gender text; target_active boolean;
begin
  if tg_op = 'INSERT' or new.category_id is distinct from old.category_id then
    select c.gender,c.active into target_gender,target_active
      from public.categories c
      where c.institution_id = new.institution_id and c.id = new.category_id;
    if not found or not target_active then
      raise exception 'La categoría no existe o está inactiva';
    end if;
  else
    select c.gender into target_gender from public.categories c
      where c.institution_id = new.institution_id and c.id = new.category_id;
  end if;
  if new.sex is not null and target_gender is not null and new.sex <> target_gender then
    raise exception 'La rama del jugador no coincide con la categoría';
  end if;
  return new;
end $$;
revoke all on function public.pilot_validate_player_branch() from public;
create trigger pilot_player_branch_guard before insert or update of category_id,sex
  on public.players for each row execute function public.pilot_validate_player_branch();

create function public.pilot_guard_category_branch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.gender is distinct from old.gender and exists (
    select 1 from public.players p
    where p.institution_id=old.institution_id and p.category_id=old.id
  ) then raise exception 'Reasigná los jugadores antes de cambiar la rama'; end if;
  return new;
end $$;
revoke all on function public.pilot_guard_category_branch() from public;
create trigger pilot_category_branch_guard before update of gender on public.categories
  for each row execute function public.pilot_guard_category_branch();

-- Rollback if required: drop the two triggers/functions and seven player/two
-- category columns in a single transaction. Export the new field values first.
commit;
