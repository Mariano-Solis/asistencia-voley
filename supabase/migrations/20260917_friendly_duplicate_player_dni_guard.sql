create or replace function public.guard_duplicate_player_dni()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_dni text := regexp_replace(coalesce(new.dni,''), '\D', '', 'g');
begin
  if nullif(v_dni,'') is null or new.approval_status not in ('pending','approved') then
    return new;
  end if;

  if exists (
    select 1
    from public.players p
    where p.id is distinct from new.id
      and p.approval_status in ('pending','approved')
      and regexp_replace(coalesce(p.dni,''), '\D', '', 'g') = v_dni
  ) then
    raise exception 'Ya existe un Jugador@ registrado con este DNI.' using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_duplicate_player_dni on public.players;
create trigger trg_guard_duplicate_player_dni
before insert or update of dni, approval_status on public.players
for each row
execute function public.guard_duplicate_player_dni();

revoke all on function public.guard_duplicate_player_dni() from public, anon, authenticated;
