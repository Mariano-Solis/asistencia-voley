-- Estadísticas de partido: permisos, sesiones y eventos.
alter table public.profiles
  add column if not exists can_manage_match_stats boolean not null default false;

alter table public.app_ui_settings
  add column if not exists player_can_view_match_stats boolean not null default false;

create table if not exists public.match_stat_sessions (
  id uuid primary key default gen_random_uuid(),
  external_match_id text,
  category_id uuid not null references public.categories(id) on delete restrict,
  category_label text not null,
  branch text not null check (branch in ('female','male')),
  match_date date,
  location text,
  our_team text not null default 'MSM',
  rival_team text not null,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  current_set smallint not null default 1 check (current_set between 1 and 5),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists match_stat_sessions_external_category_unique
  on public.match_stat_sessions(external_match_id, category_id)
  where external_match_id is not null;

create table if not exists public.match_stat_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.match_stat_sessions(id) on delete cascade,
  set_number smallint not null check (set_number between 1 and 5),
  player_id uuid references public.players(id) on delete set null,
  skill text not null check (skill in ('serve','reception','attack','block','error','team_point','opponent_point')),
  outcome text not null,
  point_for text check (point_for in ('us','opponent') or point_for is null),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists match_stat_events_session_created_idx
  on public.match_stat_events(session_id, created_at);
create index if not exists match_stat_events_player_idx
  on public.match_stat_events(player_id);

create or replace function public.can_manage_match_stats(p_category_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.approval_status = 'approved'
      and (
        p.role = 'super_admin'
        or (
          p.role = 'admin'
          and p.can_manage_match_stats = true
          and (
            public.can_view_category(p_category_id)
            or public.can_edit_category(p_category_id)
          )
        )
      )
  );
$function$;

create or replace function public.player_can_view_match_stats()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((
    select s.player_can_view_match_stats
    from public.app_ui_settings s
    where s.id = 'global'
  ), false)
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'player'
      and p.active = true
      and p.approval_status = 'approved'
  );
$function$;

alter table public.match_stat_sessions enable row level security;
alter table public.match_stat_events enable row level security;

drop policy if exists "match stat sessions managers select" on public.match_stat_sessions;
create policy "match stat sessions managers select"
  on public.match_stat_sessions for select
  using (public.can_manage_match_stats(category_id));

drop policy if exists "match stat sessions players select own" on public.match_stat_sessions;
create policy "match stat sessions players select own"
  on public.match_stat_sessions for select
  using (
    public.player_can_view_match_stats()
    and exists (
      select 1
      from public.match_stat_events e
      join public.players pl on pl.id = e.player_id
      where e.session_id = match_stat_sessions.id
        and pl.user_id = auth.uid()
    )
  );

drop policy if exists "match stat sessions managers insert" on public.match_stat_sessions;
create policy "match stat sessions managers insert"
  on public.match_stat_sessions for insert
  with check (
    public.can_manage_match_stats(category_id)
    and created_by = auth.uid()
  );

drop policy if exists "match stat sessions managers update" on public.match_stat_sessions;
create policy "match stat sessions managers update"
  on public.match_stat_sessions for update
  using (public.can_manage_match_stats(category_id))
  with check (public.can_manage_match_stats(category_id));

drop policy if exists "match stat sessions managers delete" on public.match_stat_sessions;
create policy "match stat sessions managers delete"
  on public.match_stat_sessions for delete
  using (public.can_manage_match_stats(category_id));

drop policy if exists "match stat events managers select" on public.match_stat_events;
create policy "match stat events managers select"
  on public.match_stat_events for select
  using (
    exists (
      select 1
      from public.match_stat_sessions s
      where s.id = match_stat_events.session_id
        and public.can_manage_match_stats(s.category_id)
    )
  );

drop policy if exists "match stat events players select own" on public.match_stat_events;
create policy "match stat events players select own"
  on public.match_stat_events for select
  using (
    public.player_can_view_match_stats()
    and exists (
      select 1
      from public.players pl
      where pl.id = match_stat_events.player_id
        and pl.user_id = auth.uid()
    )
  );

drop policy if exists "match stat events managers insert" on public.match_stat_events;
create policy "match stat events managers insert"
  on public.match_stat_events for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.match_stat_sessions s
      where s.id = match_stat_events.session_id
        and public.can_manage_match_stats(s.category_id)
    )
  );

drop policy if exists "match stat events managers delete" on public.match_stat_events;
create policy "match stat events managers delete"
  on public.match_stat_events for delete
  using (
    exists (
      select 1
      from public.match_stat_sessions s
      where s.id = match_stat_events.session_id
        and public.can_manage_match_stats(s.category_id)
    )
  );

grant select,insert,update,delete on public.match_stat_sessions to authenticated;
grant select,insert,delete on public.match_stat_events to authenticated;
