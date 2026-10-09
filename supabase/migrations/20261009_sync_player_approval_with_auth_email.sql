-- Sincroniza la aprobación institucional de Jugador@s con Supabase Auth.
-- Al aprobar un jugador, la aprobación institucional pasa a ser suficiente para
-- habilitar el ingreso por correo/contraseña. No afecta cuentas de Profes.
create or replace function public.review_registration_with_reason(
  p_target_id uuid,
  p_kind text,
  p_decision text,
  p_reason text default null::text
)
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
  clean_reason text := nullif(trim(coalesce(p_reason,'')), '');
begin
  if actor is null then return json_build_object('ok', false, 'message', 'No hay una sesión activa.'); end if;

  select role, active, approval_status
    into actor_role, actor_active, actor_status
  from public.profiles
  where id = actor;

  if not coalesce(actor_active, false)
     or actor_status <> 'approved'
     or actor_role not in ('admin','super_admin') then
    return json_build_object('ok', false, 'message', 'No tenés permisos para aprobar solicitudes.');
  end if;

  if p_decision not in ('approved','rejected') then
    return json_build_object('ok', false, 'message', 'Decisión no válida.');
  end if;

  if p_kind = 'player' then
    select * into target_player
    from public.players
    where id = p_target_id;

    if target_player.id is null then
      return json_build_object('ok', false, 'message', 'No se encontró el Jugador@.');
    end if;

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
      where id = target_player.user_id
        and role = 'player';

      if p_decision = 'approved' then
        update auth.users
        set
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
        where id = target_player.user_id
          and email_confirmed_at is null;
      end if;
    end if;

    return json_build_object('ok', true, 'kind', 'player', 'decision', p_decision);
  end if;

  if p_kind = 'professor' then
    if actor_role <> 'super_admin' then
      return json_build_object('ok', false, 'message', 'Sólo el Super Administrador puede aprobar Profes.');
    end if;

    select * into target_profile
    from public.profiles
    where id = p_target_id;

    if target_profile.id is null or target_profile.role <> 'pending_admin' then
      return json_build_object('ok', false, 'message', 'No se encontró una solicitud de Profe pendiente.');
    end if;

    select email_confirmed_at into confirmed_at
    from auth.users
    where id = p_target_id;

    if p_decision = 'approved' and confirmed_at is null then
      return json_build_object('ok', false, 'message', 'El Profe todavía no confirmó su correo electrónico.');
    end if;

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
$function$;

-- Reparación única de cuentas ya aprobadas que quedaron desincronizadas:
-- sólo Jugador@s activos/aprobados y sólo si el correo aún no estaba confirmado.
update auth.users u
set
  email_confirmed_at = coalesce(u.email_confirmed_at, now()),
  updated_at = now()
from public.profiles p
where p.id = u.id
  and p.role = 'player'
  and p.active = true
  and p.approval_status = 'approved'
  and u.email_confirmed_at is null;
