drop trigger if exists trg_default_single_male_first_team on public.players;
drop function if exists public.default_single_male_first_team();

create or replace function public.default_player_team_a()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(trim(coalesce(new.team, '')), '') is null then
    new.team := 'A';
  end if;
  return new;
end;
$$;

create trigger trg_default_player_team_a
before insert or update of team on public.players
for each row
execute function public.default_player_team_a();

revoke all on function public.default_player_team_a() from public, anon, authenticated;

update public.players
set team = 'A'
where active = true
  and nullif(trim(coalesce(team, '')), '') is null;
