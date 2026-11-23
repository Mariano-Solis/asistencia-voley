-- STAGED ONLY. Requires 012/013, backup and a separate commercial project.
-- Professors receive no category until an institutional administrator grants it.
begin;
do $$ begin
  if to_regclass('public.platform_owners') is null
    or to_regclass('public.profiles') is not null
    or to_regclass('public.player_private_details') is null
    or not exists (select 1 from pg_trigger where tgname='pilot_player_photo_guard')
  then raise exception 'Expected isolated commercial schema with 012 and 013'; end if;
end $$;

create table public.professor_category_permissions (
  institution_id uuid not null,
  user_id uuid not null,
  category_id uuid not null,
  can_view boolean not null default false,
  can_edit boolean not null default false,
  can_attendance boolean not null default false,
  primary key(institution_id,user_id,category_id),
  foreign key(institution_id,user_id) references public.institution_memberships(institution_id,user_id) on delete cascade,
  foreign key(institution_id,category_id) references public.categories(institution_id,id) on delete cascade,
  check (not can_edit or can_view)
);
alter table public.professor_category_permissions enable row level security;
revoke all on public.professor_category_permissions from anon,authenticated;
grant select on public.professor_category_permissions to authenticated;
create policy pilot_professor_permissions_read on public.professor_category_permissions
  for select to authenticated using (
    public.pilot_member(institution_id,true)
    or (user_id=(select auth.uid()) and public.pilot_member(institution_id))
  );

create function public.pilot_category_access(p_institution uuid,p_category uuid,p_action text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when p_action not in ('view','edit','attendance') then false
    when public.pilot_member(p_institution,true) then true
    when not public.pilot_member(p_institution) then false
    else exists (
      select 1 from public.professor_category_permissions pc
      join public.institution_memberships m on m.institution_id=pc.institution_id and m.user_id=pc.user_id
      where pc.institution_id=p_institution and pc.category_id=p_category
        and pc.user_id=(select auth.uid()) and m.role='professor' and m.status='active'
        and case p_action
          when 'view' then (pc.can_view or pc.can_edit or pc.can_attendance)
          when 'edit' then pc.can_edit
          when 'attendance' then pc.can_attendance
          else false end
    ) end
$$;
revoke all on function public.pilot_category_access(uuid,uuid,text) from public;
grant execute on function public.pilot_category_access(uuid,uuid,text) to authenticated;

create function public.pilot_session_access(p_institution uuid,p_session uuid,p_action text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.training_sessions s
    where s.institution_id=p_institution and s.id=p_session
      and public.pilot_category_access(p_institution,s.category_id,p_action)
  )
$$;
revoke all on function public.pilot_session_access(uuid,uuid,text) from public;
grant execute on function public.pilot_session_access(uuid,uuid,text) to authenticated;

create function public.pilot_set_professor_category_permission(
  p_institution uuid,p_user uuid,p_category uuid,p_view boolean,p_edit boolean,p_attendance boolean
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.pilot_member(p_institution,true) then raise exception 'Institution administrator required'; end if;
  if not exists (select 1 from public.institution_memberships m
    where m.institution_id=p_institution and m.user_id=p_user and m.role='professor')
    then raise exception 'Professor does not belong to institution'; end if;
  if not exists (select 1 from public.categories c where c.institution_id=p_institution and c.id=p_category)
    then raise exception 'Category does not belong to institution'; end if;
  if not (coalesce(p_view,false) or coalesce(p_edit,false) or coalesce(p_attendance,false)) then
    delete from public.professor_category_permissions
      where institution_id=p_institution and user_id=p_user and category_id=p_category;
  else
    insert into public.professor_category_permissions(institution_id,user_id,category_id,can_view,can_edit,can_attendance)
    values(p_institution,p_user,p_category,coalesce(p_view,false) or coalesce(p_edit,false),
      coalesce(p_edit,false),coalesce(p_attendance,false))
    on conflict(institution_id,user_id,category_id) do update set
      can_view=excluded.can_view,can_edit=excluded.can_edit,can_attendance=excluded.can_attendance;
  end if;
  insert into public.license_events(institution_id,actor_id,event)
    values(p_institution,auth.uid(),'professor_category_permission_changed');
end $$;
revoke all on function public.pilot_set_professor_category_permission(uuid,uuid,uuid,boolean,boolean,boolean) from public;
grant execute on function public.pilot_set_professor_category_permission(uuid,uuid,uuid,boolean,boolean,boolean) to authenticated;

drop policy categories_read on public.categories;
create policy categories_read on public.categories for select to authenticated
  using (public.pilot_category_access(institution_id,id,'view'));
drop policy players_read on public.players;
create policy players_read on public.players for select to authenticated
  using (public.pilot_category_access(institution_id,category_id,'view'));
drop policy players_write on public.players;
create policy players_write on public.players for all to authenticated
  using (public.pilot_category_access(institution_id,category_id,'edit'))
  with check (public.pilot_category_access(institution_id,category_id,'edit'));
drop policy sessions_read on public.training_sessions;
create policy sessions_read on public.training_sessions for select to authenticated
  using (public.pilot_category_access(institution_id,category_id,'view'));
drop policy sessions_write on public.training_sessions;
create policy sessions_write on public.training_sessions for all to authenticated
  using (public.pilot_category_access(institution_id,category_id,'attendance'))
  with check (public.pilot_category_access(institution_id,category_id,'attendance'));
drop policy attendance_read on public.attendance;
create policy attendance_read on public.attendance for select to authenticated
  using (public.pilot_session_access(institution_id,session_id,'view'));
drop policy attendance_write on public.attendance;
create policy attendance_write on public.attendance for all to authenticated
  using (public.pilot_session_access(institution_id,session_id,'attendance'))
  with check (public.pilot_session_access(institution_id,session_id,'attendance'));
-- 010 restrictive admin-only DELETE policies continue to apply.
-- Rollback must restore the prior policies in the same transaction; export
-- permission rows and verify their application before any rollback.
commit;
