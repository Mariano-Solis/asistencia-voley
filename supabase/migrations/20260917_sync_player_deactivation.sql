-- Keep soft-deletion / deactivation coherent for player-only accounts.
-- Administrative player deactivation becomes a rejected/inactive state that can
-- later be re-approved without deleting historical attendance or payment data.

create or replace function public.normalize_player_deactivation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_role text;
begin
  if old.active = true
     and new.active = false
     and old.approval_status = 'approved'
     and new.approval_status = old.approval_status then
    select role into actor_role
    from public.profiles
    where id = auth.uid();

    if actor_role in ('admin','super_admin') then
      new.approval_status := 'rejected';
      new.approved_by := null;
      new.approved_at := null;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists players_normalize_deactivation on public.players;
create trigger players_normalize_deactivation
before update of active, approval_status on public.players
for each row
execute function public.normalize_player_deactivation();

create or replace function public.sync_player_only_profile_state()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.user_id is not null then
    update public.profiles
       set active = new.active,
           approval_status = new.approval_status,
           approved_by = new.approved_by,
           approved_at = new.approved_at
     where id = new.user_id
       and role = 'player';
  end if;

  return new;
end;
$function$;

drop trigger if exists players_sync_player_only_profile_state on public.players;
create trigger players_sync_player_only_profile_state
after insert or update of active, approval_status, approved_by, approved_at on public.players
for each row
execute function public.sync_player_only_profile_state();

-- Normalize any already soft-deleted player-only account left in the old mixed state.
update public.players p
   set approval_status = 'rejected',
       approved_by = null,
       approved_at = null
 where p.active = false
   and p.approval_status = 'approved'
   and exists (
     select 1 from public.profiles pr
     where pr.id = p.user_id and pr.role = 'player'
   );

update public.profiles pr
   set active = p.active,
       approval_status = p.approval_status,
       approved_by = p.approved_by,
       approved_at = p.approved_at
  from public.players p
 where pr.id = p.user_id
   and pr.role = 'player'
   and (
     pr.active is distinct from p.active
     or pr.approval_status is distinct from p.approval_status
     or pr.approved_by is distinct from p.approved_by
     or pr.approved_at is distinct from p.approved_at
   );
