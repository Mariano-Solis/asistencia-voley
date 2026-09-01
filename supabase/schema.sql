-- =========================================================
-- MUNICIPALIDAD DE SAN MARTÍN - VOLEY · BASE DE DATOS
-- Ejecutar todo este archivo en Supabase SQL Editor.
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'player' check (role in ('admin', 'player')),
  created_at timestamptz not null default now()
);

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('present', 'late', 'absent')),
  created_at timestamptz not null default now(),
  unique(session_id, player_id)
);

alter table public.profiles enable row level security;
alter table public.training_sessions enable row level security;
alter table public.attendance enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'player'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "admin inserts profiles" on public.profiles;
create policy "admin inserts profiles"
on public.profiles for insert
to authenticated
with check (public.is_admin());

drop policy if exists "admin updates profiles" on public.profiles;
create policy "admin updates profiles"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin deletes profiles" on public.profiles;
create policy "admin deletes profiles"
on public.profiles for delete
to authenticated
using (public.is_admin());

drop policy if exists "authenticated read sessions" on public.training_sessions;
create policy "authenticated read sessions"
on public.training_sessions for select
to authenticated
using (true);

drop policy if exists "admin manages sessions" on public.training_sessions;
create policy "admin manages sessions"
on public.training_sessions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "players read own attendance" on public.attendance;
create policy "players read own attendance"
on public.attendance for select
to authenticated
using (player_id = auth.uid() or public.is_admin());

drop policy if exists "admin manages attendance" on public.attendance;
create policy "admin manages attendance"
on public.attendance for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
