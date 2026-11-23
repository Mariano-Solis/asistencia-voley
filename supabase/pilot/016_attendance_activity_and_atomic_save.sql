-- Commercial project savptjiwzaypisayulwp only. Verify backup and current
-- 001..015 schema before applying. Existing sessions remain training sessions.
begin;
do $$ begin
  if to_regclass('public.platform_owners') is null
    or to_regclass('public.profiles') is not null
    or to_regclass('public.professor_category_permissions') is null
    or to_regclass('public.training_sessions') is null
  then raise exception 'Expected isolated commercial pilot after 014'; end if;
end $$;

-- Private in-project recovery point; the authenticated role has no schema USAGE.
-- Keep these snapshots until the migration and new behavior are verified.
create table pilot_backups.c17_sessions_before_016 as select * from public.training_sessions;
create table pilot_backups.c17_marks_before_016 as select * from public.attendance;
revoke all on pilot_backups.c17_sessions_before_016,pilot_backups.c17_marks_before_016 from public,anon,authenticated;

alter table public.training_sessions
  add column activity_type text not null default 'training'
    check (activity_type in ('training','match','tournament')),
  add column opponent text check (opponent is null or length(opponent) <= 120),
  add column event_location text check (event_location is null or length(event_location) <= 160),
  add column observation text check (observation is null or length(observation) <= 1500),
  add column revision bigint not null default 1 check (revision > 0);

alter table public.training_sessions
  add constraint pilot_session_activity_unique
    unique (institution_id,category_id,session_date,activity_type);
alter table public.training_sessions
  drop constraint training_sessions_institution_id_category_id_session_date_key;

create function public.pilot_attendance_revision_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.institution_id is distinct from old.institution_id
    or new.category_id is distinct from old.category_id
    or new.session_date is distinct from old.session_date
    or new.activity_type is distinct from old.activity_type
  then raise exception 'No se puede mover una jornada existente'; end if;
  new.revision := old.revision + 1;
  return new;
end $$;
revoke all on function public.pilot_attendance_revision_guard() from public;
create trigger pilot_attendance_revision_guard before update on public.training_sessions
for each row execute function public.pilot_attendance_revision_guard();

create function public.pilot_attendance_identity_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.institution_id is distinct from old.institution_id
    or new.session_id is distinct from old.session_id
    or new.player_id is distinct from old.player_id
  then raise exception 'No se puede mover una marca de asistencia'; end if;
  return new;
end $$;
revoke all on function public.pilot_attendance_identity_guard() from public;
create trigger pilot_attendance_identity_guard before update on public.attendance
for each row execute function public.pilot_attendance_identity_guard();

create function public.pilot_attendance_mark_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.training_sessions set revision = revision + 1
    where institution_id = coalesce(new.institution_id,old.institution_id)
      and id = coalesce(new.session_id,old.session_id);
  return coalesce(new,old);
end $$;
revoke all on function public.pilot_attendance_mark_revision() from public;
create trigger pilot_attendance_mark_revision after insert or update or delete on public.attendance
for each row execute function public.pilot_attendance_mark_revision();

-- The only batch writer. SECURITY DEFINER is necessary to remove a professor's
-- stale marks despite the direct DELETE policy being administrator-only. Every
-- call checks the fresh membership/license and assigned category server-side.
create function public.pilot_save_attendance(
  p_institution uuid,p_category uuid,p_date date,p_type text,
  p_expected_revision bigint,p_marks jsonb,
  p_opponent text default null,p_location text default null,p_observation text default null
) returns table(session_id uuid,revision bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.training_sessions%rowtype;
  v_created integer;
  v_mark jsonb;
  v_player uuid;
  v_status text;
  v_seen uuid[] := array[]::uuid[];
begin
  if (select auth.uid()) is null or not public.pilot_category_access(p_institution,p_category,'attendance')
  then raise exception 'Asistencia no autorizada'; end if;
  if p_date is null or p_type not in ('training','match','tournament')
    or p_expected_revision is null or p_expected_revision < 0
    or p_marks is null or jsonb_typeof(p_marks) <> 'array'
    or jsonb_array_length(p_marks) > 500
  then raise exception 'Datos de jornada inválidos'; end if;
  if length(coalesce(p_opponent,'')) > 120 or length(coalesce(p_location,'')) > 160
    or length(coalesce(p_observation,'')) > 1500
  then raise exception 'Detalles de jornada demasiado largos'; end if;
  if not exists (select 1 from public.categories c
    where c.institution_id=p_institution and c.id=p_category and c.active)
  then raise exception 'Categoría inactiva o ajena'; end if;
  if p_type <> 'match' and nullif(btrim(p_opponent),'') is not null
  then raise exception 'El rival corresponde solo a un partido'; end if;
  for v_mark in select value from jsonb_array_elements(p_marks) loop
    if jsonb_typeof(v_mark) <> 'object'
      or not (v_mark ? 'player_id' and v_mark ? 'status')
      or jsonb_typeof(v_mark->'player_id') <> 'string'
      or jsonb_typeof(v_mark->'status') <> 'string'
    then raise exception 'Marca de asistencia inválida'; end if;
    v_player := (v_mark->>'player_id')::uuid;
    v_status := v_mark->>'status';
    if v_player = any(v_seen) or v_status not in ('present','late','absent')
      or not exists (select 1 from public.players p
        where p.institution_id=p_institution and p.id=v_player
          and p.category_id=p_category and p.active)
    then raise exception 'Jugador duplicado, inactivo o de otra categoría'; end if;
    v_seen := array_append(v_seen,v_player);
  end loop;

  insert into public.training_sessions(institution_id,category_id,session_date,activity_type)
    values (p_institution,p_category,p_date,p_type)
    on conflict on constraint pilot_session_activity_unique do nothing;
  get diagnostics v_created = row_count;
  select * into v_session from public.training_sessions s
    where s.institution_id=p_institution and s.category_id=p_category
      and s.session_date=p_date and s.activity_type=p_type for update;
  if not found then raise exception 'No se pudo obtener la jornada'; end if;
  if (v_created = 0 and v_session.revision <> p_expected_revision)
    or (v_created = 1 and p_expected_revision <> 0)
  then raise exception 'La asistencia cambió. Actualizá antes de guardar'; end if;

  update public.training_sessions s set
    opponent = case when p_type='match' then nullif(btrim(p_opponent),'') else null end,
    event_location = nullif(btrim(p_location),''),
    observation = nullif(btrim(p_observation),'')
    where s.id=v_session.id and s.institution_id=p_institution;

  delete from public.attendance a
    where a.institution_id=p_institution and a.session_id=v_session.id
      and not (a.player_id = any(v_seen))
      and exists (select 1 from public.players p where p.institution_id=p_institution
        and p.id=a.player_id and p.category_id=p_category and p.active);
  for v_mark in select value from jsonb_array_elements(p_marks) loop
    insert into public.attendance(institution_id,session_id,player_id,status)
      values(p_institution,v_session.id,(v_mark->>'player_id')::uuid,v_mark->>'status')
      on conflict on constraint attendance_pkey do update
        set status=excluded.status where public.attendance.status is distinct from excluded.status;
  end loop;
  return query select s.id,s.revision from public.training_sessions s
    where s.id=v_session.id and s.institution_id=p_institution;
end $$;
revoke all on function public.pilot_save_attendance(uuid,uuid,date,text,bigint,jsonb,text,text,text) from public;
grant execute on function public.pilot_save_attendance(uuid,uuid,date,text,bigint,jsonb,text,text,text) to authenticated;
commit;
