alter table public.user_ui_preferences
  add column if not exists hidden_tabs text[] not null default '{}'::text[];
