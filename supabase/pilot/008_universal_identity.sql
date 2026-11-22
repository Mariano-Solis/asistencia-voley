-- Dedicated commercial Supabase project savptjiwzaypisayulwp ONLY.
begin;
alter table public.institutions add column if not exists logo_path text;
alter table public.institutions add column if not exists logo_source text not null default 'none'
  check (logo_source in ('none','manual','courtrack'));
alter table public.institutions add column if not exists visual_mode text not null default 'combined'
  check (visual_mode in ('manual','automatic','combined'));
alter table public.institutions add column if not exists secondary_color text not null default '#e7eef5' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.institutions add column if not exists accent_color text not null default '#0c765b' check (accent_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.institutions add column if not exists background_color text not null default '#f1f5fa' check (background_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.institutions add column if not exists surface_color text not null default '#ffffff' check (surface_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.institutions add column if not exists country text;
alter table public.institutions add column if not exists region text;
alter table public.institutions add column if not exists city text;
alter table public.institutions add column if not exists federation text;
alter table public.institutions add column if not exists sport text not null default 'Vóley';
alter table public.institutions add column if not exists identity_updated_at timestamptz;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pilot-branding','pilot-branding',false,2097152,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;

create or replace function public.pilot_brand_object_access(p_name text,p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_institution uuid;
begin
  if p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](png|jpg|webp)$' then return false; end if;
  v_institution := split_part(p_name,'/',1)::uuid;
  return public.pilot_is_owner() or public.pilot_member(v_institution,p_write);
exception when invalid_text_representation then return false;
end $$;
revoke all on function public.pilot_brand_object_access(text,boolean) from public;
grant execute on function public.pilot_brand_object_access(text,boolean) to authenticated;

create policy pilot_brand_read on storage.objects for select to authenticated
  using (bucket_id='pilot-branding' and public.pilot_brand_object_access(name,false));
create policy pilot_brand_insert on storage.objects for insert to authenticated
  with check (bucket_id='pilot-branding' and public.pilot_brand_object_access(name,true));
create policy pilot_brand_update on storage.objects for update to authenticated
  using (bucket_id='pilot-branding' and public.pilot_brand_object_access(name,true))
  with check (bucket_id='pilot-branding' and public.pilot_brand_object_access(name,true));
create policy pilot_brand_delete on storage.objects for delete to authenticated
  using (bucket_id='pilot-branding' and public.pilot_brand_object_access(name,true));

create or replace function public.pilot_update_identity(
  p_institution uuid,p_name text,p_primary text,p_secondary text,p_accent text,
  p_background text,p_surface text,p_logo_path text,p_mode text,
  p_country text default null,p_region text default null,p_city text default null,
  p_federation text default null,p_sport text default 'Vóley'
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.pilot_is_owner() or public.pilot_member(p_institution,true)) then raise exception 'Institution administrator required'; end if;
  if p_name is null or length(btrim(p_name)) not between 2 and 100
    or p_primary is null or p_primary !~ '^#[0-9A-Fa-f]{6}$'
    or p_secondary is null or p_secondary !~ '^#[0-9A-Fa-f]{6}$'
    or p_accent is null or p_accent !~ '^#[0-9A-Fa-f]{6}$'
    or p_background is null or p_background !~ '^#[0-9A-Fa-f]{6}$'
    or p_surface is null or p_surface !~ '^#[0-9A-Fa-f]{6}$'
    or p_mode is null or p_mode not in ('manual','combined','automatic')
    or length(coalesce(p_country,''))>80 or length(coalesce(p_region,''))>80
    or length(coalesce(p_city,''))>80 or length(coalesce(p_federation,''))>100
    or length(coalesce(p_sport,''))>80
    then raise exception 'Invalid institutional identity'; end if;
  if p_logo_path is not null and (
    p_logo_path !~ ('^' || p_institution::text || '/[0-9a-f-]{36}[.](png|jpg|webp)$')
    or not exists(select 1 from storage.objects where bucket_id='pilot-branding' and name=p_logo_path)
  ) then raise exception 'Invalid logo path'; end if;
  update public.institutions set name=btrim(p_name),primary_color=p_primary,secondary_color=p_secondary,
    accent_color=p_accent,background_color=p_background,surface_color=p_surface,
    logo_path=p_logo_path,logo_source=case when p_logo_path is not null then 'manual' else logo_source end,
    visual_mode=p_mode,country=nullif(btrim(p_country),''),region=nullif(btrim(p_region),''),
    city=nullif(btrim(p_city),''),federation=nullif(btrim(p_federation),''),sport=coalesce(nullif(btrim(p_sport),''),'Vóley'),
    identity_updated_at=now()
  where id=p_institution;
  if not found then raise exception 'Institution not found'; end if;
  insert into public.license_events(institution_id,actor_id,event)
    values(p_institution,auth.uid(),'identity_updated');
end $$;
revoke all on function public.pilot_update_identity(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.pilot_update_identity(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;
commit;
