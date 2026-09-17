create or replace function public.get_superadmin_professor_accounts()
returns table(
  professor_id uuid,
  full_name text,
  email text,
  active boolean,
  approval_status text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  actor_active boolean;
  actor_status text;
begin
  select pr.role, pr.active, pr.approval_status
    into actor_role, actor_active, actor_status
  from public.profiles pr
  where pr.id = actor;

  if actor is null
     or actor_role <> 'super_admin'
     or not coalesce(actor_active, false)
     or actor_status <> 'approved' then
    raise exception 'No tenés permisos para consultar cuentas de profes.';
  end if;

  return query
  select pr.id, pr.full_name, u.email::text, pr.active, pr.approval_status
  from public.profiles pr
  left join auth.users u on u.id = pr.id
  where pr.role = 'admin'
  order by pr.full_name nulls last;
end;
$$;

revoke all on function public.get_superadmin_professor_accounts() from public;
revoke all on function public.get_superadmin_professor_accounts() from anon;
grant execute on function public.get_superadmin_professor_accounts() to authenticated;

create or replace function public.superadmin_update_professor(
  p_professor_id uuid,
  p_full_name text,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  actor_active boolean;
  actor_status text;
begin
  select pr.role, pr.active, pr.approval_status
    into actor_role, actor_active, actor_status
  from public.profiles pr
  where pr.id = actor;

  if actor is null
     or actor_role <> 'super_admin'
     or not coalesce(actor_active, false)
     or actor_status <> 'approved' then
    raise exception 'No tenés permisos para modificar profes.';
  end if;

  if nullif(btrim(p_full_name), '') is null then
    raise exception 'El nombre del profe es obligatorio.';
  end if;

  update public.profiles pr
  set full_name = btrim(p_full_name),
      active = coalesce(p_active, pr.active)
  where pr.id = p_professor_id
    and pr.role = 'admin';

  if not found then
    raise exception 'No se encontró el profe indicado.';
  end if;
end;
$$;

revoke all on function public.superadmin_update_professor(uuid, text, boolean) from public;
revoke all on function public.superadmin_update_professor(uuid, text, boolean) from anon;
grant execute on function public.superadmin_update_professor(uuid, text, boolean) to authenticated;
