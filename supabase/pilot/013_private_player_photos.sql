-- STAGED ONLY: requires 012 and a verified backup of the commercial schema.
-- Uploads use new object names; replacing a photo never overwrites an object.
begin;
do $$ begin
  if to_regclass('public.platform_owners') is null
    or to_regclass('public.profiles') is not null
    or to_regclass('storage.objects') is null
    or not exists (select 1 from pg_trigger where tgname='pilot_player_branch_guard')
  then raise exception 'Expected isolated commercial schema with migration 012'; end if;
end $$;

alter table public.players add column photo_path text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('pilot-player-photos','pilot-player-photos',false,2097152,array['image/webp'])
on conflict (id) do nothing;

create function public.pilot_photo_access(p_name text,p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_institution uuid; v_player uuid;
begin
  if p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
  then return false; end if;
  v_institution := split_part(p_name,'/',1)::uuid;
  v_player := split_part(p_name,'/',2)::uuid;
  return public.pilot_member(v_institution,p_write)
    and exists (select 1 from public.players p where p.institution_id=v_institution and p.id=v_player);
end $$;
revoke all on function public.pilot_photo_access(text,boolean) from public;
grant execute on function public.pilot_photo_access(text,boolean) to authenticated;

create policy pilot_photo_read on storage.objects for select to authenticated
  using (bucket_id='pilot-player-photos' and public.pilot_photo_access(name,false));
create policy pilot_photo_insert on storage.objects for insert to authenticated
  with check (bucket_id='pilot-player-photos' and public.pilot_photo_access(name,true));
create policy pilot_photo_delete on storage.objects for delete to authenticated
  using (bucket_id='pilot-player-photos' and public.pilot_photo_access(name,true));

create function public.pilot_validate_photo_link() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op='INSERT' then
    if new.photo_path is null then return new; end if;
  elsif new.photo_path is not distinct from old.photo_path then return new;
  end if;
  if not public.pilot_member(new.institution_id,true) then raise exception 'Institution administrator required for photos'; end if;
  if new.photo_path is not null and (
    new.photo_path !~ ('^' || new.institution_id::text || '/' || new.id::text || '/[0-9a-f-]{36}[.]webp$')
    or not exists (select 1 from storage.objects o where o.bucket_id='pilot-player-photos' and o.name=new.photo_path)
  ) then raise exception 'Invalid player photo path'; end if;
  return new;
end $$;
revoke all on function public.pilot_validate_photo_link() from public;
create trigger pilot_player_photo_guard before insert or update of photo_path on public.players
  for each row execute function public.pilot_validate_photo_link();
-- Rollback: export photo paths, drop trigger/functions/policies/bucket and
-- column. Preserve referenced objects until a separate authorized cleanup.
commit;
