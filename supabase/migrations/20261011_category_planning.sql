-- Planificación por categoría: rutinas, notas, imágenes, PDFs y pizarras tácticas.
create table if not exists public.planning_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  item_type text not null check (item_type in ('routine','note','image','pdf','board')),
  title text not null check (char_length(trim(title)) between 1 and 140),
  body text,
  storage_path text,
  mime_type text,
  file_size bigint,
  board_data jsonb,
  target_date date,
  visible_to_players boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_items_payload_check check (
    (item_type in ('routine','note') and body is not null)
    or (item_type in ('image','pdf') and storage_path is not null)
    or (item_type = 'board' and board_data is not null)
  )
);

create index if not exists planning_items_category_created_idx
  on public.planning_items(category_id, created_at desc);
create index if not exists planning_items_category_target_idx
  on public.planning_items(category_id, target_date);

alter table public.planning_items enable row level security;

create or replace function private.can_manage_planning_category(p_category_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.approval_status = 'approved'
      and (
        p.role = 'super_admin'
        or (
          p.role = 'admin'
          and exists (
            select 1
            from public.admin_category_permissions acp
            where acp.admin_id = p.id
              and acp.category_id = p_category_id
              and acp.can_edit = true
          )
        )
      )
  );
$function$;

create or replace function private.can_view_planning_category(p_category_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $function$
  select
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.approval_status = 'approved'
        and (
          p.role = 'super_admin'
          or (
            p.role = 'admin'
            and exists (
              select 1
              from public.admin_category_permissions acp
              where acp.admin_id = p.id
                and acp.category_id = p_category_id
                and (acp.can_view = true or acp.can_edit = true or acp.can_attendance = true)
            )
          )
        )
    )
    or exists (
      select 1
      from public.players pl
      where pl.user_id = auth.uid()
        and pl.active = true
        and pl.approval_status = 'approved'
        and pl.category_id = p_category_id
    );
$function$;

revoke all on function private.can_manage_planning_category(uuid) from public, anon;
revoke all on function private.can_view_planning_category(uuid) from public, anon;
grant execute on function private.can_manage_planning_category(uuid) to authenticated;
grant execute on function private.can_view_planning_category(uuid) to authenticated;

drop policy if exists "planning staff read" on public.planning_items;
create policy "planning staff read"
  on public.planning_items for select
  to authenticated
  using (
    private.can_manage_planning_category(category_id)
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','super_admin')
        and p.active = true
        and p.approval_status = 'approved'
        and private.can_view_planning_category(category_id)
    )
  );

drop policy if exists "planning players read own category" on public.planning_items;
create policy "planning players read own category"
  on public.planning_items for select
  to authenticated
  using (
    visible_to_players = true
    and exists (
      select 1
      from public.players pl
      where pl.user_id = auth.uid()
        and pl.active = true
        and pl.approval_status = 'approved'
        and pl.category_id = planning_items.category_id
    )
  );

drop policy if exists "planning managers insert" on public.planning_items;
create policy "planning managers insert"
  on public.planning_items for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and private.can_manage_planning_category(category_id)
  );

drop policy if exists "planning managers update" on public.planning_items;
create policy "planning managers update"
  on public.planning_items for update
  to authenticated
  using (private.can_manage_planning_category(category_id))
  with check (private.can_manage_planning_category(category_id));

drop policy if exists "planning managers delete" on public.planning_items;
create policy "planning managers delete"
  on public.planning_items for delete
  to authenticated
  using (private.can_manage_planning_category(category_id));

grant select,insert,update,delete on public.planning_items to authenticated;

-- Bucket privado para archivos de planificación.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'planning-materials',
  'planning-materials',
  false,
  12582912,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.planning_path_category(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, private, storage
as $function$
declare
  folder text;
begin
  folder := (storage.foldername(p_name))[1];
  if folder is null or folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;
  return folder::uuid;
end;
$function$;

create or replace function private.can_read_planning_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $function$
  select exists (
    select 1
    from public.planning_items pi
    where pi.storage_path = p_name
      and (
        private.can_manage_planning_category(pi.category_id)
        or (
          pi.visible_to_players = true
          and private.can_view_planning_category(pi.category_id)
        )
      )
  );
$function$;

revoke all on function private.planning_path_category(text) from public, anon;
revoke all on function private.can_read_planning_object(text) from public, anon;
grant execute on function private.planning_path_category(text) to authenticated;
grant execute on function private.can_read_planning_object(text) to authenticated;

drop policy if exists "planning materials read" on storage.objects;
create policy "planning materials read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'planning-materials'
    and private.can_read_planning_object(name)
  );

drop policy if exists "planning materials upload" on storage.objects;
create policy "planning materials upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'planning-materials'
    and private.can_manage_planning_category(private.planning_path_category(name))
  );

drop policy if exists "planning materials update" on storage.objects;
create policy "planning materials update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'planning-materials'
    and private.can_manage_planning_category(private.planning_path_category(name))
  )
  with check (
    bucket_id = 'planning-materials'
    and private.can_manage_planning_category(private.planning_path_category(name))
  );

drop policy if exists "planning materials delete" on storage.objects;
create policy "planning materials delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'planning-materials'
    and private.can_manage_planning_category(private.planning_path_category(name))
  );
