-- Keep professor names consistent with the player naming rule at account creation.
-- Professor profile display: Firstname LASTNAME.
-- The signup metadata keeps first_name and last_name separately, so compound names
-- and surnames can be normalized without guessing where the surname begins.

create or replace function public.normalize_professor_profile_on_insert()
returns trigger
language plpgsql
set search_path to 'public', 'auth'
as $function$
declare
  first_value text;
  last_value text;
begin
  if new.role <> 'pending_admin' then
    return new;
  end if;

  select nullif(btrim(u.raw_user_meta_data ->> 'first_name'), ''),
         nullif(btrim(u.raw_user_meta_data ->> 'last_name'), '')
    into first_value, last_value
  from auth.users u
  where u.id = new.id;

  if first_value is not null and last_value is not null then
    new.full_name := public.normalize_person_name(first_value)
      || ' '
      || upper(regexp_replace(btrim(last_value), '\s+', ' ', 'g'));
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_normalize_professor_profile_on_insert on public.profiles;
create trigger trg_normalize_professor_profile_on_insert
before insert on public.profiles
for each row
execute function public.normalize_professor_profile_on_insert();

-- Normalize existing Professor profiles from their original, separately stored
-- signup metadata. This avoids guessing with compound names or surnames.
update public.profiles p
set full_name = public.normalize_person_name(u.raw_user_meta_data ->> 'first_name')
  || ' '
  || upper(regexp_replace(btrim(u.raw_user_meta_data ->> 'last_name'), '\s+', ' ', 'g'))
from auth.users u
where u.id = p.id
  and p.role in ('admin', 'pending_admin')
  and nullif(btrim(u.raw_user_meta_data ->> 'first_name'), '') is not null
  and nullif(btrim(u.raw_user_meta_data ->> 'last_name'), '') is not null;
