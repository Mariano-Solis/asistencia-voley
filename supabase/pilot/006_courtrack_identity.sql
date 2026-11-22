-- Dedicated commercial project savptjiwzaypisayulwp ONLY. Additive and reversible.
begin;
alter table public.institutions add column if not exists external_team_code text;
alter table public.institutions add column if not exists external_source text;
alter table public.institutions add column if not exists external_updated_at timestamptz;
create unique index if not exists institutions_external_team_unique
  on public.institutions(external_source,external_team_code)
  where external_team_code is not null;

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
revoke all on function public.pilot_set_courtrack_identity(uuid,text,text,text) from public;
grant execute on function public.pilot_set_courtrack_identity(uuid,text,text,text) to authenticated;
commit;
