create or replace function public.default_single_male_first_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_gender text;
begin
  if new.category_id is null then
    return new;
  end if;

  select c.name, c.gender
    into v_name, v_gender
  from public.categories c
  where c.id = new.category_id;

  if v_gender = 'male'
     and lower(trim(coalesce(v_name, ''))) = 'primera'
     and nullif(trim(coalesce(new.team, '')), '') is null then
    new.team := 'A';
  end if;

  return new;
end;
$$;

revoke all on function public.default_single_male_first_team() from public, anon, authenticated;

drop trigger if exists trg_default_single_male_first_team on public.players;
create trigger trg_default_single_male_first_team
before insert or update of category_id, team on public.players
for each row
execute function public.default_single_male_first_team();

update public.players p
set team = 'A'
from public.categories c
where p.category_id = c.id
  and c.gender = 'male'
  and lower(trim(c.name)) = 'primera'
  and nullif(trim(coalesce(p.team, '')), '') is null;
