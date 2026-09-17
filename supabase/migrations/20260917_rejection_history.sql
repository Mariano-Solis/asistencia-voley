alter table public.players
  add column if not exists rejected_by uuid,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text;

alter table public.profiles
  add column if not exists rejected_by uuid,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text;

create or replace function public.review_registration_with_reason(
  p_target_id uuid,
  p_kind text,
  p_decision text,
  p_reason text default null
)
returns json
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  actor_active boolean;
  actor_status text;
  target_player public.players;
  target_profile public.profiles;
  confirmed_at timestamptz;
  clean_reason text := nullif(trim(coalesce(p_reason,'')), '');
begin
  if actor is null then return json_build_object('ok', false, 'message', 'No hay una sesión activa.'); end if;
  select role, active, approval_status into actor_role, actor_active, actor_status from public.profiles where id = actor;
  if not coalesce(actor_active, false) or actor_status <> 'approved' or actor_role not in ('admin','super_admin') then
    return json_build_object('ok', false, 'message', 'No tenés permisos para aprobar solicitudes.');
  end if;
  if p_decision not in ('approved','rejected') then return json_build_object('ok', false, 'message', 'Decisión no válida.'); end if;

  if p_kind = 'player' then
    select * into target_player from public.players where id = p_target_id;
    if target_player.id is null then return json_build_object('ok', false, 'message', 'No se encontró el Jugador@.'); end if;
    if actor_role <> 'super_admin' and target_player.user_id = actor then
      return json_build_object('ok', false, 'message', 'Tu perfil de Jugador@ debe ser aprobado por otro Profe autorizado o por el Super Administrador.');
    end if;
    if actor_role <> 'super_admin' and not public.can_edit_category(target_player.category_id) then
      return json_build_object('ok', false, 'message', 'Sólo podés aprobar Jugador@s de categorías que administrás.');
    end if;

    update public.players set
      approval_status = p_decision,
      active = (p_decision = 'approved'),
      approved_by = case when p_decision = 'approved' then actor else null end,
      approved_at = case when p_decision = 'approved' then now() else null end,
      rejected_by = case when p_decision = 'rejected' then actor else null end,
      rejected_at = case when p_decision = 'rejected' then now() else null end,
      rejection_reason = case when p_decision = 'rejected' then clean_reason else null end
    where id = target_player.id;

    if target_player.user_id is not null then
      update public.profiles set
        approval_status = p_decision,
        active = (p_decision = 'approved'),
        approved_by = case when p_decision = 'approved' then actor else null end,
        approved_at = case when p_decision = 'approved' then now() else null end,
        rejected_by = case when p_decision = 'rejected' then actor else null end,
        rejected_at = case when p_decision = 'rejected' then now() else null end,
        rejection_reason = case when p_decision = 'rejected' then clean_reason else null end
      where id = target_player.user_id and role = 'player';
    end if;
    return json_build_object('ok', true, 'kind', 'player', 'decision', p_decision);
  end if;

  if p_kind = 'professor' then
    if actor_role <> 'super_admin' then return json_build_object('ok', false, 'message', 'Sólo el Super Administrador puede aprobar Profes.'); end if;
    select * into target_profile from public.profiles where id = p_target_id;
    if target_profile.id is null or target_profile.role <> 'pending_admin' then return json_build_object('ok', false, 'message', 'No se encontró una solicitud de Profe pendiente.'); end if;
    select email_confirmed_at into confirmed_at from auth.users where id = p_target_id;
    if p_decision = 'approved' and confirmed_at is null then return json_build_object('ok', false, 'message', 'El Profe todavía no confirmó su correo electrónico.'); end if;
    update public.profiles set
      role = case when p_decision = 'approved' then 'admin' else 'pending_admin' end,
      approval_status = p_decision,
      active = (p_decision = 'approved'),
      approved_by = case when p_decision = 'approved' then actor else null end,
      approved_at = case when p_decision = 'approved' then now() else null end,
      rejected_by = case when p_decision = 'rejected' then actor else null end,
      rejected_at = case when p_decision = 'rejected' then now() else null end,
      rejection_reason = case when p_decision = 'rejected' then clean_reason else null end
    where id = p_target_id;
    return json_build_object('ok', true, 'kind', 'professor', 'decision', p_decision);
  end if;
  return json_build_object('ok', false, 'message', 'Tipo de solicitud no válido.');
end;
$$;

create or replace function public.review_registration(p_target_id uuid, p_kind text, p_decision text)
returns json
language sql
security definer
set search_path to 'public','auth'
as $$ select public.review_registration_with_reason(p_target_id, p_kind, p_decision, null); $$;

create or replace function public.get_registration_requests()
returns json
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  actor uuid := auth.uid(); actor_role text; actor_active boolean; actor_status text; players_json json; professors_json json;
begin
  select role, active, approval_status into actor_role, actor_active, actor_status from public.profiles where id = actor;
  if actor is null or not coalesce(actor_active,false) or actor_status <> 'approved' or actor_role not in ('admin','super_admin') then
    return json_build_object('players', '[]'::json, 'professors', '[]'::json);
  end if;
  select coalesce(json_agg(row_to_json(x) order by x.created_at desc), '[]'::json) into players_json from (
    select p.id, p.user_id, p.full_name, p.sex, p.birth_date, p.category_id, c.name as category_name, p.created_at, p.approval_status,
           p.rejected_at, p.rejected_by, p.rejection_reason, reviewer.full_name as rejected_by_name
    from public.players p
    left join public.categories c on c.id = p.category_id
    left join public.profiles reviewer on reviewer.id = p.rejected_by
    where p.approval_status in ('pending','rejected') and (
      actor_role = 'super_admin' or (p.user_id is distinct from actor and public.can_edit_category(p.category_id))
    )
  ) x;
  if actor_role = 'super_admin' then
    select coalesce(json_agg(row_to_json(x) order by x.created_at desc), '[]'::json) into professors_json from (
      select p.id, p.full_name, p.created_at, p.approval_status, u.email,
             p.rejected_at, p.rejected_by, p.rejection_reason, reviewer.full_name as rejected_by_name
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.profiles reviewer on reviewer.id = p.rejected_by
      where p.role = 'pending_admin' and p.approval_status in ('pending','rejected')
    ) x;
  else professors_json := '[]'::json; end if;
  return json_build_object('players', players_json, 'professors', professors_json);
end;
$$;

revoke all on function public.review_registration_with_reason(uuid,text,text,text) from public, anon;
grant execute on function public.review_registration_with_reason(uuid,text,text,text) to authenticated;
revoke all on function public.review_registration(uuid,text,text) from public, anon;
grant execute on function public.review_registration(uuid,text,text) to authenticated;
revoke all on function public.get_registration_requests() from public, anon;
grant execute on function public.get_registration_requests() to authenticated;
