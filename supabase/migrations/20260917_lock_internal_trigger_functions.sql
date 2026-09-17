-- These functions are trigger implementation details only. They must not be
-- directly callable through the exposed REST RPC surface.
revoke all on function public.normalize_player_deactivation() from public;
revoke all on function public.normalize_player_deactivation() from anon;
revoke all on function public.normalize_player_deactivation() from authenticated;
revoke all on function public.sync_player_only_profile_state() from public;
revoke all on function public.sync_player_only_profile_state() from anon;
revoke all on function public.sync_player_only_profile_state() from authenticated;
