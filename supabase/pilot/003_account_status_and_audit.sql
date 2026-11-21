-- Dedicated JNN pilot project only. Additive and reversible.
begin;
do $$ begin
  if to_regclass('public.platform_owners') is null or to_regclass('public.institution_memberships') is null
     or to_regclass('public.license_events') is null or to_regclass('public.profiles') is not null then
    raise exception 'Expected dedicated commercial pilot schema';
  end if;
end $$;

create function public.pilot_account_status()
returns table(institution_id uuid,institution_name text,role text,membership_status text,
  institution_status text,license_status text,expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id,i.name,m.role,m.status,i.status,l.status,l.expires_at
  from public.institution_memberships m
  join public.institutions i on i.id=m.institution_id
  join public.institution_licenses l on l.institution_id=i.id
  where m.user_id=(select auth.uid())
  order by i.name
$$;

create function public.pilot_owner_events(p_institution uuid, p_limit int default 50)
returns table(event text,created_at timestamptz,actor_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.pilot_is_owner() then raise exception 'Platform owner required'; end if;
  if p_limit not between 1 and 100 then raise exception 'Invalid limit'; end if;
  return query select e.event,e.created_at,e.actor_id from public.license_events e
  where e.institution_id=p_institution order by e.created_at desc,e.id desc limit p_limit;
end $$;

revoke all on function public.pilot_account_status(),public.pilot_owner_events(uuid,int) from public;
grant execute on function public.pilot_account_status(),public.pilot_owner_events(uuid,int) to authenticated;
commit;
