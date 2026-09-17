create unique index if not exists players_unique_active_dni_norm
on public.players ((regexp_replace(coalesce(dni,''), '\D', '', 'g')))
where nullif(regexp_replace(coalesce(dni,''), '\D', '', 'g'), '') is not null
  and approval_status in ('pending','approved');

create or replace function public.player_dni_exists(p_dni text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.players p
    where p.approval_status in ('pending','approved')
      and nullif(regexp_replace(coalesce(p.dni,''), '\D', '', 'g'), '') is not null
      and regexp_replace(coalesce(p.dni,''), '\D', '', 'g') = regexp_replace(coalesce(p_dni,''), '\D', '', 'g')
  );
$$;

revoke all on function public.player_dni_exists(text) from public;
grant execute on function public.player_dni_exists(text) to anon, authenticated;
