alter table public.profiles
  add column if not exists can_view_general_standings boolean not null default false;
