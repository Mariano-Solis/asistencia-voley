alter table public.profiles
  add column if not exists professor_allowed_tabs text[] null;
