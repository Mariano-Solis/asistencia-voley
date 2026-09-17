create or replace function public.calculate_player_category(p_birth_date date, p_sex text)
returns uuid
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_age integer;
  v_category_name text;
  v_category_id uuid;
  v_year integer := extract(year from timezone('America/Argentina/Mendoza', now()))::integer;
begin
  -- Any category explicitly selected from an administrative screen has priority
  -- over automatic assignment. Existing admin flows keep the selected category
  -- whenever this RPC returns null.
  if exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
  ) then
    return null;
  end if;

  if p_birth_date is null or p_sex is null then
    return null;
  end if;

  v_age := v_year - extract(year from p_birth_date)::integer;

  if lower(trim(p_sex)) = 'male' then
    v_category_name := 'Primera';
  else
    if v_age >= 30 then v_category_name := 'Master A';
    elsif v_age <= 12 then v_category_name := 'Sub 12';
    elsif v_age <= 14 then v_category_name := 'Sub 14';
    elsif v_age <= 16 then v_category_name := 'Sub 16';
    elsif v_age <= 18 then v_category_name := 'Sub 18';
    else v_category_name := 'Primera';
    end if;
  end if;

  select id into v_category_id
  from public.categories
  where lower(trim(name)) = lower(trim(v_category_name))
    and lower(trim(gender)) = lower(trim(p_sex))
    and active = true
  order by created_at
  limit 1;

  return v_category_id;
end;
$function$;
