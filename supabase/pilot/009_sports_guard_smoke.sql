-- Run in the dedicated commercial project only, after 009_sports_tenant_and_history_guards.sql.
-- This exercises actual PostgreSQL triggers, not user JWT authorization. All fixtures roll back.
begin;
do $$
declare v_i uuid; v_c uuid; v_c2 uuid; v_p uuid; v_s uuid;
begin
  insert into public.institutions(slug,name) values('guard-smoke-20261123','Guard Smoke Ficticio') returning id into v_i;
  insert into public.categories(institution_id,name) values(v_i,'Sub 16 ensayo') returning id into v_c;
  insert into public.categories(institution_id,name) values(v_i,'Sub 18 ensayo') returning id into v_c2;
  insert into public.players(institution_id,category_id,full_name) values(v_i,v_c,'Jugador ficticio guard') returning id into v_p;
  insert into public.training_sessions(institution_id,category_id,session_date) values(v_i,v_c,current_date) returning id into v_s;
  insert into public.attendance(institution_id,session_id,player_id,status) values(v_i,v_s,v_p,'present');
  update public.attendance set status='late' where institution_id=v_i and session_id=v_s and player_id=v_p;
  if (select status from public.attendance where institution_id=v_i and session_id=v_s and player_id=v_p) <> 'late' then
    raise exception 'ordinary attendance update failed';
  end if;
  begin
    update public.players set category_id=v_c2 where id=v_p;
    raise exception 'player guard missed';
  exception when others then
    if sqlerrm <> 'Player with recorded attendance cannot change category' then raise; end if;
  end;
  begin
    update public.training_sessions set category_id=v_c2 where id=v_s;
    raise exception 'session guard missed';
  exception when others then
    if sqlerrm <> 'Session with recorded attendance cannot change category' then raise; end if;
  end;
  begin
    update public.players set institution_id=gen_random_uuid() where id=v_p;
    raise exception 'tenant guard missed';
  exception when others then
    if sqlerrm <> 'Institution cannot be changed' then raise; end if;
  end;
end $$;
rollback;
select 'PASS: actual PostgreSQL guards, fictitious rows rolled back' as result;
