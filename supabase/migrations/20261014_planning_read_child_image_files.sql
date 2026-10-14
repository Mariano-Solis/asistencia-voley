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
    where (
      pi.storage_path = p_name
      or exists (
        select 1
        from public.planning_item_files pif
        where pif.planning_item_id = pi.id
          and pif.storage_path = p_name
      )
    )
    and (
      private.can_manage_planning_category(pi.category_id)
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('admin','super_admin')
          and p.active = true
          and p.approval_status = 'approved'
          and private.can_view_planning_category(pi.category_id)
      )
      or (
        pi.visible_to_players = true
        and exists (
          select 1
          from public.players pl
          where pl.user_id = auth.uid()
            and pl.active = true
            and pl.approval_status = 'approved'
            and pl.category_id = pi.category_id
        )
      )
    )
  );
$function$;
