-- DELETE Realtime: conservar la fila anterior completa para sincronizar Deshacer entre dispositivos.
alter table public.match_stat_events replica identity full;
