create table if not exists public.planning_item_files (
  id uuid primary key default gen_random_uuid(),
  planning_item_id uuid not null references public.planning_items(id) on delete cascade,
  storage_path text not null,
  mime_type text,
  file_size bigint,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists planning_item_files_item_position_idx
  on public.planning_item_files(planning_item_id, position);

alter table public.planning_item_files enable row level security;

drop policy if exists "planning item files read" on public.planning_item_files;
create policy "planning item files read"
on public.planning_item_files
for select
to authenticated
using (
  exists (
    select 1
    from public.planning_items pi
    where pi.id = planning_item_files.planning_item_id
      and (
        private.can_manage_planning_category(pi.category_id)
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = any(array['admin'::text,'super_admin'::text])
            and p.active = true
            and p.approval_status = 'approved'::text
            and private.can_view_planning_category(pi.category_id)
        )
        or (
          pi.visible_to_players = true
          and exists (
            select 1
            from public.players pl
            where pl.user_id = auth.uid()
              and pl.active = true
              and pl.approval_status = 'approved'::text
              and pl.category_id = pi.category_id
          )
        )
      )
  )
);

drop policy if exists "planning item files insert" on public.planning_item_files;
create policy "planning item files insert"
on public.planning_item_files
for insert
to authenticated
with check (
  exists (
    select 1
    from public.planning_items pi
    where pi.id = planning_item_files.planning_item_id
      and pi.created_by = auth.uid()
      and private.can_manage_planning_category(pi.category_id)
  )
);

drop policy if exists "planning item files delete" on public.planning_item_files;
create policy "planning item files delete"
on public.planning_item_files
for delete
to authenticated
using (
  exists (
    select 1
    from public.planning_items pi
    where pi.id = planning_item_files.planning_item_id
      and private.can_manage_planning_category(pi.category_id)
  )
);
