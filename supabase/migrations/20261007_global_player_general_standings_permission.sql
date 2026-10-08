-- Permiso global: una sola configuración para todos los perfiles de jugador.
alter table public.app_ui_settings
  add column if not exists player_can_view_general_standings boolean not null default false;
