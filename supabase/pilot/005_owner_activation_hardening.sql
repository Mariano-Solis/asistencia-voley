-- Apply ONLY to the dedicated commercial pilot project after 001–004.
-- Serialized issuance prevents two simultaneous owner requests from leaving
-- multiple active codes for one institution and recipient.
create or replace function public.pilot_issue_code(p_institution uuid, p_email text, p_hours int default 48)
returns text language plpgsql security definer set search_path = '' as $$
declare v_code text; v_email text := lower(btrim(p_email));
begin
  if not public.pilot_is_owner() then raise exception 'Only platform owner can issue codes'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 168 then raise exception 'Invalid duration'; end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid email'; end if;
  perform 1 from public.institutions where id=p_institution for update;
  if not found then raise exception 'Unknown institution'; end if;
  if not exists(select 1 from public.institution_licenses l join public.institutions i on i.id=l.institution_id
      where i.id=p_institution and i.status='active' and l.status='active' and l.expires_at>now())
    then raise exception 'Institution license is not active'; end if;
  update public.activation_codes set revoked_at=now()
    where institution_id=p_institution and email=v_email and redeemed_at is null and revoked_at is null;
  v_code := encode(extensions.gen_random_bytes(24),'hex');
  insert into public.activation_codes(institution_id,email,code_hash,expires_at)
    values(p_institution,v_email,encode(extensions.digest(v_code,'sha256'),'hex'),now()+make_interval(hours=>p_hours));
  insert into public.license_events(institution_id,actor_id,event) values(p_institution,auth.uid(),'code_issued');
  return v_code;
end $$;

create or replace function public.pilot_redeem_code(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_record public.activation_codes%rowtype; v_email text; v_verified timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if public.pilot_is_owner() then raise exception 'Platform owner cannot join an institution'; end if;
  select lower(email),email_confirmed_at into v_email,v_verified from auth.users where id=auth.uid();
  if v_verified is null then raise exception 'Verify email first'; end if;
  select * into v_record from public.activation_codes
    where code_hash=encode(extensions.digest(btrim(p_code),'sha256'),'hex') for update;
  if not found or v_record.revoked_at is not null or v_record.redeemed_at is not null or v_record.expires_at <= now()
     or v_record.email <> v_email then raise exception 'Invalid or expired activation'; end if;
  if not exists(select 1 from public.institution_licenses l join public.institutions i on i.id=l.institution_id
     where l.institution_id=v_record.institution_id and l.status='active' and l.expires_at>now() and i.status='active')
     then raise exception 'Institution is not active'; end if;
  insert into public.institution_memberships(institution_id,user_id,role)
    values(v_record.institution_id,auth.uid(),'super_admin')
    on conflict(institution_id,user_id) do nothing;
  if not found then raise exception 'Already a member'; end if;
  update public.activation_codes set redeemed_at=now(),redeemed_by=auth.uid() where id=v_record.id;
  insert into public.license_events(institution_id,actor_id,event) values(v_record.institution_id,auth.uid(),'code_redeemed');
  return v_record.institution_id;
end $$;

revoke all on function public.pilot_issue_code(uuid,text,int),public.pilot_redeem_code(text) from public,anon;
grant execute on function public.pilot_issue_code(uuid,text,int),public.pilot_redeem_code(text) to authenticated;
