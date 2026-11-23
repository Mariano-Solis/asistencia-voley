-- Run only in savptjiwzaypisayulwp. Database-admin transaction, NOT a JWT/RLS test.
-- Every fixture is rolled back; do not remove the preflight or ROLLBACK.
begin;
do $$ begin
  if to_regclass('public.platform_owners') is null
    or to_regclass('public.attendance') is null
    or to_regclass('public.profiles') is not null
    or not exists (select 1 from pg_trigger where tgname='pilot_player_recorded_delete')
  then raise exception 'Expected isolated commercial pilot with migration 010'; end if;
end $$;
do $$
declare v_i uuid; v_c uuid; v_p uuid; v_s uuid;
begin
  insert into public.institutions(slug,name)
    values('c12-integrity-smoke-20261123','C12 Integridad Ficticia') returning id into v_i;
  insert into public.categories(institution_id,name) values(v_i,'Sub 16 ensayo') returning id into v_c;
  begin
    insert into public.categories(institution_id,name) values(v_i,'Sub 16 ensayo');
    raise exception 'duplicate category was accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.categories(institution_id,name) values(v_i,'  ');
    raise exception 'blank category was accepted';
  exception when check_violation then null; end;
  insert into public.players(institution_id,category_id,full_name)
    values(v_i,v_c,'Jugador ficticio C12') returning id into v_p;
  begin
    insert into public.players(institution_id,category_id,full_name)
      values(v_i,gen_random_uuid(),'Jugador sin categoría');
    raise exception 'orphan player was accepted';
  exception when foreign_key_violation then null; end;
  insert into public.training_sessions(institution_id,category_id,session_date)
    values(v_i,v_c,current_date) returning id into v_s;
  begin
    insert into public.training_sessions(institution_id,category_id,session_date)
      values(v_i,v_c,current_date);
    raise exception 'duplicate session was accepted';
  exception when unique_violation then null; end;
  insert into public.attendance(institution_id,session_id,player_id,status)
    values(v_i,v_s,v_p,'present');
  begin
    insert into public.attendance(institution_id,session_id,player_id,status)
      values(v_i,v_s,v_p,'present');
    raise exception 'duplicate attendance was accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.attendance(institution_id,session_id,player_id,status)
      values(v_i,v_s,v_p,'justified');
    raise exception 'unknown sport status was accepted';
  exception when check_violation then null; end;
  insert into public.attendance(institution_id,session_id,player_id,status)
    values(v_i,v_s,v_p,'late')
    on conflict (institution_id,session_id,player_id)
    do update set status=excluded.status;
  if (select count(*) from public.attendance where institution_id=v_i) <> 1
    or (select status from public.attendance where institution_id=v_i) <> 'late'
  then raise exception 'idempotent attendance retry failed'; end if;
  begin
    delete from public.players where id=v_p;
    raise exception 'recorded player was deleted';
  exception when others then
    if sqlerrm <> 'Deactivate a player with recorded attendance instead of deleting' then raise; end if;
  end;
  update public.players set active=false where id=v_p;
  if (select count(*) from public.attendance where institution_id=v_i) <> 1
  then raise exception 'deactivation lost attendance history'; end if;
end $$;
rollback;
select 'PASS: commercial PostgreSQL integrity; transaction rolled back' as result
where not exists (select 1 from public.institutions where slug='c12-integrity-smoke-20261123');
