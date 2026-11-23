-- Commercial project only. Runs inside a transaction and leaves no fixture.
begin;
do $$
declare v_i uuid; v_c uuid; v_p uuid; v_s uuid; v_rejected int := 0;
begin
  insert into public.institutions(slug,name)
    values ('guard-delete-smoke-20261123','Ensayo borrado JNN') returning id into v_i;
  insert into public.categories(institution_id,name)
    values (v_i,'Categoría ficticia') returning id into v_c;
  insert into public.players(institution_id,category_id,full_name)
    values (v_i,v_c,'Jugador ficticio') returning id into v_p;
  insert into public.training_sessions(institution_id,category_id,session_date)
    values (v_i,v_c,current_date) returning id into v_s;
  insert into public.attendance(institution_id,session_id,player_id,status)
    values (v_i,v_s,v_p,'present');
  begin
    delete from public.players where id=v_p;
  exception when others then v_rejected := v_rejected+1;
  end;
  begin
    delete from public.training_sessions where id=v_s;
  exception when others then v_rejected := v_rejected+1;
  end;
  if v_rejected<>2 then raise exception 'Recorded delete guard failed: %',v_rejected; end if;
  if not exists(select 1 from public.attendance
    where institution_id=v_i and session_id=v_s and player_id=v_p)
    then raise exception 'Attendance was lost'; end if;
end $$;
rollback;
select count(*) as residual_fake_clubs from public.institutions
  where slug='guard-delete-smoke-20261123';
