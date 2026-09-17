create or replace function public.get_superadmin_player_account_emails()
returns table(player_id uuid, email text)
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
  select role, active, approval_status
    into actor_role, actor_active, actor_status
  from public.profiles
  where id = actor;

  if actor is null
     or actor_role <> 'super_admin'
     or not coalesce(actor_active, false)
     or actor_status <> 'approved' then
    raise exception 'No tenés permisos para consultar correos de cuentas.';
  end if;

  return query
  select p.id, u.email::text
  from public.players p
  left join auth.users u on u.id = p.user_id
  where p.active = true;
end;
$$;

revoke all on function public.get_superadmin_player_account_emails() from public;
revoke all on function public.get_superadmin_player_account_emails() from anon;
grant execute on function public.get_superadmin_player_account_emails() to authenticated;
