-- Dedicated commercial project only. Owner creates buyers in pending state.
begin;
do $$ begin
  if to_regclass('public.platform_owners') is null or to_regclass('public.institution_licenses') is null
     or to_regclass('public.profiles') is not null then
    raise exception 'Expected dedicated commercial pilot schema';
  end if;
end $$;

create function public.pilot_create_institution(p_slug text,p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.pilot_is_owner() then raise exception 'Platform owner required'; end if;
  if p_slug is null or p_slug !~ '^[a-z0-9-]{2,40}$'
     or p_name is null or length(btrim(p_name)) not between 2 and 100 then
    raise exception 'Invalid institution';
  end if;
  insert into public.institutions(slug,name,status)
  values(p_slug,btrim(p_name),'pending') returning id into v_id;
  insert into public.institution_licenses(institution_id,status) values(v_id,'pending');
  insert into public.license_events(institution_id,actor_id,event)
  values(v_id,auth.uid(),'institution_created');
  return v_id;
end $$;
revoke all on function public.pilot_create_institution(text,text) from public;
grant execute on function public.pilot_create_institution(text,text) to authenticated;
commit;
