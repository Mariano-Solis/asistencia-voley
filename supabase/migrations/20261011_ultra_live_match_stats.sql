-- Estadísticas Ultra Live: alineación, rotación, modos y Realtime.
alter table public.match_stat_sessions
  add column if not exists current_lineup uuid[] not null default '{}'::uuid[],
  add column if not exists rotation smallint not null default 1,
  add column if not exists input_mode text not null default 'rally';

alter table public.match_stat_sessions
  drop constraint if exists match_stat_sessions_rotation_check,
  add constraint match_stat_sessions_rotation_check check (rotation between 1 and 6);

alter table public.match_stat_sessions
  drop constraint if exists match_stat_sessions_input_mode_check,
  add constraint match_stat_sessions_input_mode_check check (input_mode in ('simple','rally','complete'));

alter table public.match_stat_events
  drop constraint if exists match_stat_events_skill_check;

alter table public.match_stat_events
  add constraint match_stat_events_skill_check
  check (skill = any (array[
    'serve'::text,
    'reception'::text,
    'set'::text,
    'attack'::text,
    'block'::text,
    'defense'::text,
    'error'::text,
    'team_point'::text,
    'opponent_point'::text
  ]));

-- Publicar sesiones y eventos para sincronización instantánea entre dispositivos.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='match_stat_sessions'
  ) then
    alter publication supabase_realtime add table public.match_stat_sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='match_stat_events'
  ) then
    alter publication supabase_realtime add table public.match_stat_events;
  end if;
end $$;
