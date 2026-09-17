-- Keep player names consistent regardless of how users type them.
-- first_name: Proper Case (e.g. Maria Jose)
-- last_name: UPPERCASE (e.g. PEREZ)
-- full_name: LASTNAME Firstname
-- Player-only profile display name: Firstname LASTNAME

create or replace function public.normalize_person_name(value text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when value is null or btrim(value) = '' then null
    else initcap(lower(regexp_replace(btrim(value), '\s+', ' ', 'g')))
  end
$function$;

create or replace function public.normalize_player_name_fields()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.first_name is not null then
    new.first_name := public.normalize_person_name(new.first_name);
  end if;

  if new.last_name is not null then
    new.last_name := upper(regexp_replace(btrim(new.last_name), '\s+', ' ', 'g'));
  end if;

  if new.first_name is not null and new.last_name is not null then
    new.full_name := new.last_name || ' ' || new.first_name;
  elsif new.full_name is not null then
    new.full_name := regexp_replace(btrim(new.full_name), '\s+', ' ', 'g');
  end if;

  return new;
end;
$function$;

create or replace function public.sync_player_profile_display_name()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.user_id is not null and new.first_name is not null and new.last_name is not null then
    update public.profiles
       set full_name = new.first_name || ' ' || new.last_name
     where id = new.user_id
       and role = 'player';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_normalize_player_name_fields on public.players;
create trigger trg_normalize_player_name_fields
before insert or update of first_name, last_name, full_name
on public.players
for each row
execute function public.normalize_player_name_fields();

drop trigger if exists trg_sync_player_profile_display_name on public.players;
create trigger trg_sync_player_profile_display_name
after insert or update of first_name, last_name, full_name
on public.players
for each row
execute function public.sync_player_profile_display_name();

-- Normalize every existing player once. The triggers above also synchronize
-- the display name for player-only profiles.
update public.players
set first_name = first_name,
    last_name = last_name,
    full_name = full_name;
