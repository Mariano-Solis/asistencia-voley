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
  add column category_override boolean not null default false;

-- Do not put DNI/birth date in players: professors can read those rows for
-- attendance. Personal fields live behind separate administrator-only RLS.
create table public.player_private_details (
  institution_id uuid not null,
  player_id uuid not null,
  first_name text not null check (length(btrim(first_name)) between 1 and 80),
  last_name text not null check (length(btrim(last_name)) between 1 and 80),
  sex text check (sex in ('female','male')),
  dni text check (dni is null or dni ~ '^[0-9]{6,12}$'),
  birth_date date check (birth_date is null or birth_date <= current_date),
  team text check (team is null or length(btrim(team)) between 1 and 40),
  primary key (institution_id,player_id),
  foreign key (institution_id,player_id) references public.players(institution_id,id) on delete cascade
);
create unique index pilot_private_dni_unique on public.player_private_details(institution_id,dni) where dni is not null;
alter table public.player_private_details enable row level security;
revoke all on public.player_private_details from anon,authenticated;
grant select,insert,update,delete on public.player_private_details to authenticated;
create policy pilot_private_admin on public.player_private_details for all to authenticated
  using (public.pilot_member(institution_id,true)) with check (public.pilot_member(institution_id,true));

-- An existing row with no recorded branch keeps its original category. A
-- new assignment to a known branch must match; an inactive category cannot
-- accept a new player. Historical attendance/category guards still apply.
create function public.pilot_validate_player_branch() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_gender text; target_active boolean; player_sex text;
begin
  if tg_op = 'INSERT' then
    select c.gender,c.active into target_gender,target_active
      from public.categories c where c.institution_id=new.institution_id and c.id=new.category_id;
    if not found or not target_active then raise exception 'La categoría no existe o está inactiva'; end if;
    return new;
  end if;
  if new.category_id is distinct from old.category_id then
    select c.gender,c.active into target_gender,target_active
      from public.categories c
      where c.institution_id = new.institution_id and c.id = new.category_id;
    if not found or not target_active then
      raise exception 'La categoría no existe o está inactiva';
    end if;
    select d.sex into player_sex from public.player_private_details d
      where d.institution_id=new.institution_id and d.player_id=new.id;
    if player_sex is not null and target_gender is not null and player_sex <> target_gender then
      raise exception 'La rama del jugador no coincide con la categoría';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.pilot_validate_player_branch() from public;
create trigger pilot_player_branch_guard before insert or update of category_id
  on public.players for each row execute function public.pilot_validate_player_branch();

create function public.pilot_validate_private_branch() returns trigger
language plpgsql set search_path = '' as $$
declare target_gender text;
begin
  select c.gender into target_gender from public.players p join public.categories c
    on c.institution_id=p.institution_id and c.id=p.category_id
    where p.institution_id=new.institution_id and p.id=new.player_id;
  if not found then raise exception 'El jugador no pertenece a esa institución'; end if;
  if new.sex is not null and target_gender is not null and new.sex <> target_gender then
    raise exception 'La rama del jugador no coincide con la categoría';
  end if;
  return new;
end $$;
revoke all on function public.pilot_validate_private_branch() from public;
create trigger pilot_private_branch_guard before insert or update of sex
  on public.player_private_details for each row execute function public.pilot_validate_private_branch();

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

-- Atomic administrator save: if any validation fails, both the public player
-- and private fields roll back together. A recorded category remains guarded
-- by migration 009 even when this privileged function performs the update.
create function public.pilot_save_player(
  p_institution uuid,p_player uuid,p_category uuid,p_first text,p_last text,
  p_sex text,p_dni text,p_birth date,p_team text,p_override boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_player uuid; v_name text;
begin
  if not public.pilot_member(p_institution,true) then raise exception 'Institution administrator required'; end if;
  v_name := upper(btrim(p_last)) || ' ' || btrim(p_first);
  if p_first is null or p_last is null or length(v_name) not between 2 and 120
    then raise exception 'Invalid player name'; end if;
  if p_player is null then
    insert into public.players(institution_id,category_id,full_name,category_override)
      values(p_institution,p_category,v_name,coalesce(p_override,false)) returning id into v_player;
  else
    select id into v_player from public.players
      where institution_id=p_institution and id=p_player for update;
    if not found then raise exception 'Player not found in institution'; end if;
    delete from public.player_private_details where institution_id=p_institution and player_id=v_player;
    update public.players set category_id=p_category,full_name=v_name,category_override=coalesce(p_override,false)
      where institution_id=p_institution and id=v_player;
  end if;
  insert into public.player_private_details(institution_id,player_id,first_name,last_name,sex,dni,birth_date,team)
    values(p_institution,v_player,btrim(p_first),btrim(p_last),p_sex,p_dni,p_birth,p_team);
  return v_player;
end $$;
revoke all on function public.pilot_save_player(uuid,uuid,uuid,text,text,text,text,date,text,boolean) from public;
grant execute on function public.pilot_save_player(uuid,uuid,uuid,text,text,text,text,date,text,boolean) to authenticated;

-- Rollback if required: export private rows first, then drop three triggers,
-- four functions, private table/index, player override and two category
-- columns in one transaction. Preserve existing players and attendance.
commit;
