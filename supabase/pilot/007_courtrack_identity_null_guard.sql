-- Dedicated commercial project only; harden the already-applied 006 function.
begin;
create or replace function public.pilot_set_courtrack_identity(
  p_institution uuid,p_team_code text,p_logo_url text,p_primary_color text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.pilot_is_owner() then raise exception 'Owner required'; end if;
  if p_team_code is null or p_logo_url is null or p_primary_color is null
    or p_team_code !~ '^[A-Za-z0-9 _.-]{2,40}$'
    or p_logo_url !~ '^https://cdn[.]courtrack[.]com/image/upload/[^?#]+/Courtrack/App/FMV/Logos/[^?#]+$'
    or p_primary_color !~ '^#[0-9A-Fa-f]{6}$'
    then raise exception 'Invalid Court Track identity'; end if;
  update public.institutions
    set external_team_code=btrim(p_team_code),external_source='courtrack-fmv-standings',
      external_updated_at=now(),logo_url=p_logo_url,primary_color=p_primary_color
    where id=p_institution;
  if not found then raise exception 'Institution not found'; end if;
  insert into public.license_events(institution_id,actor_id,event)
    values(p_institution,auth.uid(),'courtrack_identity_selected');
end $$;
commit;
