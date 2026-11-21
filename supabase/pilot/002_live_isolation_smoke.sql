-- Run ONLY in the dedicated JNN pilot project after 001_isolated_pilot.sql.
-- All fictitious accounts, rows, codes and helper functions are rolled back.
-- This tests real PostgreSQL RLS and pgcrypto; it simulates auth.uid() with
-- request.jwt.claim.sub. Browser signup/email confirmation remains a separate gate.
begin;
set local statement_timeout = '60s';

insert into auth.users(id,email,email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000001','pilot-owner@example.invalid',now()),
  ('00000000-0000-4000-8000-000000000002','pilot-jnn@example.invalid',now()),
  ('00000000-0000-4000-8000-000000000003','pilot-other@example.invalid',now()),
  ('00000000-0000-4000-8000-000000000004','pilot-professor@example.invalid',now()),
  ('00000000-0000-4000-8000-000000000005','pilot-outsider@example.invalid',now());
insert into public.platform_owners(user_id) values ('00000000-0000-4000-8000-000000000001');
insert into public.institutions(id,slug,name) values
  ('20000000-0000-4000-8000-000000000001','test-other','Club ficticio B');
insert into public.institution_licenses(institution_id) values ('20000000-0000-4000-8000-000000000001');

create temporary table pilot_codes (institution_id uuid, code text) on commit drop;
grant select,insert on pilot_codes to authenticated;
create function pg_temp.assert_denied(p_command text) returns void language plpgsql as $$
begin
  begin execute p_command;
  exception when others then return;
  end;
  raise exception 'Expected denial but operation succeeded: %',p_command;
end $$;
create function pg_temp.assert_eq(p_actual bigint,p_expected bigint,p_name text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception '%: expected %, got %',p_name,p_expected,p_actual;
  end if;
end $$;
create function pg_temp.assert_no_change(p_command text,p_name text) returns void language plpgsql as $$
declare affected bigint;
begin
  execute p_command;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception '%: modified % rows',p_name,affected; end if;
end $$;
grant execute on function pg_temp.assert_denied(text),pg_temp.assert_eq(bigint,bigint,text),pg_temp.assert_no_change(text,text) to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.pilot_set_license(id,now()+interval '3 days',true) from public.institutions where slug in ('jnn','test-other');
insert into pilot_codes select id,public.pilot_issue_code(id,'pilot-jnn@example.invalid') from public.institutions where slug='jnn';
insert into pilot_codes select id,public.pilot_issue_code(id,'pilot-other@example.invalid') from public.institutions where slug='test-other';

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
select pg_temp.assert_denied(format('select public.pilot_redeem_code(%L)',code)) from pilot_codes limit 1;
select pg_temp.assert_denied(format('select public.pilot_issue_code(%L,%L)',institution_id,'pilot-outsider@example.invalid')) from pilot_codes limit 1;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select public.pilot_redeem_code(code) from pilot_codes where institution_id<>'20000000-0000-4000-8000-000000000001';
select pg_temp.assert_denied(format('select public.pilot_redeem_code(%L)',code)) from pilot_codes where institution_id<>'20000000-0000-4000-8000-000000000001';
insert into public.categories(id,institution_id,name)
select '30000000-0000-4000-8000-000000000001',id,'Sub 16 ficticia' from public.institutions where slug='jnn';
insert into public.players(id,institution_id,category_id,full_name)
select '40000000-0000-4000-8000-000000000001',id,'30000000-0000-4000-8000-000000000001','Jugador ficticio A' from public.institutions where slug='jnn';
insert into public.training_sessions(id,institution_id,category_id,session_date)
select '50000000-0000-4000-8000-000000000001',id,'30000000-0000-4000-8000-000000000001',current_date from public.institutions where slug='jnn';
insert into public.attendance(institution_id,session_id,player_id,status)
select id,'50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','present' from public.institutions where slug='jnn';
select public.pilot_add_professor(id,'pilot-professor@example.invalid') from public.institutions where slug='jnn';
select pg_temp.assert_eq((select count(*) from public.pilot_list_professors((select id from public.institutions where slug='jnn'))),1,'professor added');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select public.pilot_redeem_code(code) from pilot_codes where institution_id='20000000-0000-4000-8000-000000000001';
insert into public.categories(id,institution_id,name) values ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Sub 18 ficticia');
select pg_temp.assert_eq((select count(*) from public.categories where id='30000000-0000-4000-8000-000000000001'),0,'B cannot read JNN category');
select pg_temp.assert_eq((select count(*) from public.players where id='40000000-0000-4000-8000-000000000001'),0,'B cannot read JNN player');
select pg_temp.assert_eq((select count(*) from public.training_sessions where id='50000000-0000-4000-8000-000000000001'),0,'B cannot read JNN session');
select pg_temp.assert_eq((select count(*) from public.attendance where session_id='50000000-0000-4000-8000-000000000001'),0,'B cannot read JNN attendance');
select pg_temp.assert_no_change($q$update public.players set full_name='forbidden' where id='40000000-0000-4000-8000-000000000001'$q$,'B cannot update JNN');
select pg_temp.assert_no_change($q$delete from public.players where id='40000000-0000-4000-8000-000000000001'$q$,'B cannot delete JNN');
select pg_temp.assert_denied($q$insert into public.players(institution_id,category_id,full_name) values ((select id from public.institutions where slug='test-other'),'30000000-0000-4000-8000-000000000001','cross FK')$q$);
select pg_temp.assert_denied(format($q$insert into public.players(institution_id,category_id,full_name) values (%L,'30000000-0000-4000-8000-000000000002','wrong tenant')$q$,institution_id)) from pilot_codes where institution_id<>'20000000-0000-4000-8000-000000000001';
select pg_temp.assert_denied(format('select * from public.pilot_list_professors(%L)',institution_id)) from pilot_codes where institution_id<>'20000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
select pg_temp.assert_eq((select count(*) from public.players where id='40000000-0000-4000-8000-000000000001'),1,'JNN professor reads own player');
select pg_temp.assert_denied($q$insert into public.categories(institution_id,name) values ((select institution_id from public.institution_memberships where user_id=auth.uid()),'forbidden')$q$);
select pg_temp.assert_denied($q$select public.pilot_set_license('20000000-0000-4000-8000-000000000001'::uuid,now(),false)$q$);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select public.pilot_set_professor_status(institution_id,'00000000-0000-4000-8000-000000000004',false) from pilot_codes where institution_id<>'20000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
select pg_temp.assert_eq((select count(*) from public.players where id='40000000-0000-4000-8000-000000000001'),0,'suspended professor denied');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.pilot_set_license(institution_id,null,false) from pilot_codes where institution_id<>'20000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_eq((select count(*) from public.players where id='40000000-0000-4000-8000-000000000001'),0,'suspended license denied');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.pilot_set_license(institution_id,now()+interval '3 days',true) from pilot_codes where institution_id<>'20000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_eq((select count(*) from public.players where id='40000000-0000-4000-8000-000000000001'),1,'renewed license restores own data');
rollback;
select 'PASS: real PostgreSQL RLS, licenses, activation and tenant isolation; fixtures rolled back' as result;
