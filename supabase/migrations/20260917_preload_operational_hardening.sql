-- Pre-load operational hardening for the semi-massive data entry day.
-- 1) Keep automatic category calculation deterministic and caller-independent.
-- 2) Make dual-role player self-enrollment pending until human approval.
-- 3) Prevent regular professors from approving their own player request.
-- 4) Remove anonymous execution from approval-management RPCs.
-- 5) Cover the app_ui_settings foreign key flagged by the performance advisor.

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

create or replace function public.create_my_player_profile(
  p_first_name text,
  p_last_name text,
  p_sex text,
  p_dni text,
  p_birth_date date
)
returns public.players
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  uid uuid := auth.uid();
  role_value text;
  category_value uuid;
  generated_code text;
  result_row public.players;
begin
  if uid is null then
    raise exception 'No hay una sesión activa.';
  end if;

  select role into role_value
  from public.profiles
  where id = uid;

  if role_value not in ('admin','super_admin') then
    raise exception 'Esta función es solo para Profes o Super Admin.';
  end if;

  category_value := public.calculate_player_category(p_birth_date, p_sex);
  if category_value is null then
    raise exception 'No se pudo determinar una categoría automática. Revisá sexo, fecha de nacimiento y categorías activas.';
  end if;

  select * into result_row
  from public.players
  where user_id = uid
  limit 1;

  if result_row.id is not null then
    if result_row.active and result_row.approval_status = 'approved' then
      return result_row;
    end if;

    update public.players
       set first_name = trim(p_first_name),
           last_name = trim(p_last_name),
           full_name = upper(trim(p_last_name)) || ' ' || trim(p_first_name),
           sex = nullif(trim(p_sex),''),
           dni = nullif(trim(p_dni),''),
           birth_date = p_birth_date,
           category_id = category_value,
           active = false,
           approval_status = 'pending',
           approved_by = null,
           approved_at = null
     where id = result_row.id
     returning * into result_row;

    return result_row;
  end if;

  loop
    generated_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)) || '-' || lpad((floor(random()*9000)+1000)::int::text, 4, '0');
    exit when not exists (select 1 from public.players where access_code = generated_code);
  end loop;

  insert into public.players (
    user_id, full_name, first_name, last_name, access_code, active, team,
    sex, dni, birth_date, category_id, approval_status, approved_by, approved_at
  ) values (
    uid,
    upper(trim(p_last_name)) || ' ' || trim(p_first_name),
    trim(p_first_name),
    trim(p_last_name),
    generated_code,
    false,
    null,
    nullif(trim(p_sex),''),
    nullif(trim(p_dni),''),
    p_birth_date,
    category_value,
    'pending',
    null,
    null
  )
  returning * into result_row;

  return result_row;
end;
$function$;

create or replace function public.get_registration_requests()
returns json
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  actor uuid := auth.uid();
  actor_role text;
  actor_active boolean;
  actor_status text;
  players_json json;
  professors_json json;
begin
  select role, active, approval_status
    into actor_role, actor_active, actor_status
  from public.profiles where id = actor;

  if actor is null or not coalesce(actor_active,false) or actor_status <> 'approved' or actor_role not in ('admin','super_admin') then
    return json_build_object('players', '[]'::json, 'professors', '[]'::json);
  end if;

  select coalesce(json_agg(row_to_json(x) order by x.created_at desc), '[]'::json)
  into players_json
  from (
    select p.id, p.user_id, p.full_name, p.sex, p.birth_date, p.category_id,
           c.name as category_name, p.created_at, p.approval_status
    from public.players p
    left join public.categories c on c.id = p.category_id
    where p.approval_status in ('pending','rejected')
      and (
        actor_role = 'super_admin'
        or (p.user_id is distinct from actor and public.can_edit_category(p.category_id))
      )
  ) x;

  if actor_role = 'super_admin' then
    select coalesce(json_agg(row_to_json(x) order by x.created_at desc), '[]'::json)
    into professors_json
    from (
      select p.id, p.full_name, p.created_at, p.approval_status, u.email
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.role = 'pending_admin' and p.approval_status in ('pending','rejected')
    ) x;
  else
    professors_json := '[]'::json;
  end if;

  return json_build_object('players', players_json, 'professors', professors_json);
end;
$function$;

create or replace function public.review_registration(p_target_id uuid, p_kind text, p_decision text)
returns json
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  actor uuid := auth.uid();
  actor_role text;
  actor_active boolean;
  actor_status text;
  target_player public.players;
  target_profile public.profiles;
  confirmed_at timestamptz;
begin
  if actor is null then
    return json_build_object('ok', false, 'message', 'No hay una sesión activa.');
  end if;

  select role, active, approval_status
    into actor_role, actor_active, actor_status
  from public.profiles
  where id = actor;

  if not coalesce(actor_active, false) or actor_status <> 'approved' or actor_role not in ('admin','super_admin') then
    return json_build_object('ok', false, 'message', 'No tenés permisos para aprobar solicitudes.');
  end if;

  if p_decision not in ('approved','rejected') then
    return json_build_object('ok', false, 'message', 'Decisión no válida.');
  end if;

  if p_kind = 'player' then
    select * into target_player from public.players where id = p_target_id;
    if target_player.id is null then
      return json_build_object('ok', false, 'message', 'No se encontró el Jugador@.');
    end if;

    if actor_role <> 'super_admin' and target_player.user_id = actor then
      return json_build_object('ok', false, 'message', 'Tu perfil de Jugador@ debe ser aprobado por otro Profe autorizado o por el Super Administrador.');
    end if;

    if actor_role <> 'super_admin' and not public.can_edit_category(target_player.category_id) then
      return json_build_object('ok', false, 'message', 'Sólo podés aprobar Jugador@s de categorías que administrás.');
    end if;

    update public.players
      set approval_status = p_decision,
          active = (p_decision = 'approved'),
          approved_by = case when p_decision = 'approved' then actor else null end,
          approved_at = case when p_decision = 'approved' then now() else null end
    where id = target_player.id;

    if target_player.user_id is not null then
      -- Player-only accounts mirror approval onto their profile. Admin/Super Admin
      -- profiles keep their administrative role and approval untouched.
      update public.profiles
        set approval_status = p_decision,
            active = (p_decision = 'approved'),
            approved_by = case when p_decision = 'approved' then actor else null end,
            approved_at = case when p_decision = 'approved' then now() else null end
      where id = target_player.user_id and role = 'player';
    end if;

    return json_build_object('ok', true, 'kind', 'player', 'decision', p_decision);
  end if;

  if p_kind = 'professor' then
    if actor_role <> 'super_admin' then
      return json_build_object('ok', false, 'message', 'Sólo el Super Administrador puede aprobar Profes.');
    end if;

    select * into target_profile from public.profiles where id = p_target_id;
    if target_profile.id is null or target_profile.role <> 'pending_admin' then
      return json_build_object('ok', false, 'message', 'No se encontró una solicitud de Profe pendiente.');
    end if;

    select email_confirmed_at into confirmed_at from auth.users where id = p_target_id;
    if p_decision = 'approved' and confirmed_at is null then
      return json_build_object('ok', false, 'message', 'El Profe todavía no confirmó su correo electrónico.');
    end if;

    update public.profiles
      set role = case when p_decision = 'approved' then 'admin' else 'pending_admin' end,
          approval_status = p_decision,
          active = (p_decision = 'approved'),
          approved_by = case when p_decision = 'approved' then actor else null end,
          approved_at = case when p_decision = 'approved' then now() else null end
    where id = p_target_id;

    return json_build_object('ok', true, 'kind', 'professor', 'decision', p_decision);
  end if;

  return json_build_object('ok', false, 'message', 'Tipo de solicitud no válido.');
end;
$function$;

revoke execute on function public.get_registration_requests() from anon;
revoke execute on function public.review_registration(uuid,text,text) from anon;
grant execute on function public.get_registration_requests() to authenticated;
grant execute on function public.review_registration(uuid,text,text) to authenticated;

create index if not exists app_ui_settings_updated_by_idx
  on public.app_ui_settings(updated_by);
