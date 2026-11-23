-- Commercial project only. The event trigger remains enabled for DDL;
-- ordinary API roles do not need to execute its SECURITY DEFINER function.
begin;
do $$ begin
  if to_regclass('public.platform_owners') is null
    or to_regclass('public.profiles') is not null
    or not exists (
      select 1 from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid
      where e.evtname='ensure_rls' and p.oid='public.rls_auto_enable()'::regprocedure
        and p.prorettype='event_trigger'::regtype
    ) then raise exception 'Expected dedicated pilot with enabled RLS event trigger'; end if;
end $$;
revoke all on function public.rls_auto_enable() from public,anon,authenticated;
commit;
