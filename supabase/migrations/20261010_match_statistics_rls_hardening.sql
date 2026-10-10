-- Evita dependencias recursivas entre las políticas RLS de sesiones y eventos.
create or replace function public.can_manage_match_stat_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.match_stat_sessions s
    where s.id = p_session_id
      and public.can_manage_match_stats(s.category_id)
  );
$function$;

create or replace function public.player_owns_match_stat_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.player_can_view_match_stats()
    and exists (
      select 1
      from public.match_stat_events e
      join public.players pl on pl.id = e.player_id
      where e.session_id = p_session_id
        and pl.user_id = auth.uid()
    );
$function$;

drop policy if exists "match stat sessions players select own" on public.match_stat_sessions;
create policy "match stat sessions players select own"
  on public.match_stat_sessions for select
  using (public.player_owns_match_stat_session(id));

drop policy if exists "match stat events managers select" on public.match_stat_events;
create policy "match stat events managers select"
  on public.match_stat_events for select
  using (public.can_manage_match_stat_session(session_id));

drop policy if exists "match stat events managers insert" on public.match_stat_events;
create policy "match stat events managers insert"
  on public.match_stat_events for insert
  with check (
    created_by = auth.uid()
    and public.can_manage_match_stat_session(session_id)
  );

drop policy if exists "match stat events managers delete" on public.match_stat_events;
create policy "match stat events managers delete"
  on public.match_stat_events for delete
  using (public.can_manage_match_stat_session(session_id));
