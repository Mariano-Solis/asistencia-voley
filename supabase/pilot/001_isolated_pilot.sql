-- Run ONLY in a fresh, separate Supabase project. Never run against San Martín.
begin;
do $$ begin
  if to_regclass('public.profiles') is not null or to_regclass('public.players') is not null
     or to_regclass('public.institutions') is not null then
    raise exception 'Pilot requires an empty, dedicated database';
  end if;
end $$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.platform_owners (
  user_id uuid primary key references auth.users(id) on delete restrict
);
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (length(btrim(name)) between 2 and 100),
  primary_color text not null default '#194b77' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url text,
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  created_at timestamptz not null default now()
);
create table public.institution_memberships (
  institution_id uuid not null references public.institutions(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin','professor')),
  status text not null default 'active' check (status in ('active','suspended')),
  primary key (institution_id,user_id)
);
create table public.institution_licenses (
  institution_id uuid primary key references public.institutions(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','active','suspended','expired')),
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
create table public.activation_codes (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete restrict,
  email text not null check (email = lower(btrim(email))),
  code_hash text not null unique,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.license_events (
  id bigint generated always as identity primary key,
  institution_id uuid not null references public.institutions(id),
  actor_id uuid references auth.users(id),
  event text not null,
  created_at timestamptz not null default now()
);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  name text not null check (length(btrim(name)) between 2 and 80),
  unique (institution_id,id), unique (institution_id,name)
);
create table public.players (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  category_id uuid not null,
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  active boolean not null default true,
  unique (institution_id,id),
  foreign key (institution_id,category_id) references public.categories(institution_id,id)
);
create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  category_id uuid not null,
  session_date date not null,
  unique (institution_id,id), unique (institution_id,category_id,session_date),
  foreign key (institution_id,category_id) references public.categories(institution_id,id)
);
create table public.attendance (
  institution_id uuid not null references public.institutions(id),
  session_id uuid not null,
  player_id uuid not null,
  status text not null check (status in ('present','late','absent')),
  primary key (institution_id,session_id,player_id),
  foreign key (institution_id,session_id) references public.training_sessions(institution_id,id) on delete cascade,
  foreign key (institution_id,player_id) references public.players(institution_id,id) on delete cascade
);
create function public.pilot_validate_attendance_category() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.players p join public.training_sessions s
      on s.institution_id=p.institution_id and s.category_id=p.category_id
    where p.institution_id=new.institution_id and p.id=new.player_id and p.active and s.id=new.session_id
  ) then raise exception 'Player and session categories must match'; end if;
  return new;
end $$;
create trigger validate_attendance_category before insert or update on public.attendance
for each row execute function public.pilot_validate_attendance_category();
create index on public.institution_memberships(user_id,institution_id);
create index on public.players(institution_id,category_id);
create index on public.training_sessions(institution_id,category_id,session_date);

create function public.pilot_is_owner() returns boolean language sql stable security definer
set search_path = '' as $$
  select exists (select 1 from public.platform_owners where user_id = (select auth.uid()))
$$;
create function public.pilot_member(p_institution uuid, p_admin_only boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.institution_memberships m
    join public.institutions i on i.id = m.institution_id
    join public.institution_licenses l on l.institution_id = i.id
    where m.institution_id = p_institution and m.user_id = (select auth.uid())
      and m.status = 'active' and (not p_admin_only or m.role = 'super_admin')
      and i.status = 'active' and l.status = 'active' and l.expires_at > now()
  )
$$;
revoke all on function public.pilot_is_owner() from public;
revoke all on function public.pilot_member(uuid,boolean) from public;
grant execute on function public.pilot_is_owner(), public.pilot_member(uuid,boolean) to authenticated;

-- No direct membership, license, activation-code or owner writes from clients.
alter table public.platform_owners enable row level security;
alter table public.institutions enable row level security;
alter table public.institution_memberships enable row level security;
alter table public.institution_licenses enable row level security;
alter table public.activation_codes enable row level security;
alter table public.license_events enable row level security;
alter table public.categories enable row level security;
alter table public.players enable row level security;
alter table public.training_sessions enable row level security;
alter table public.attendance enable row level security;

create policy institutions_read on public.institutions for select to authenticated
using (public.pilot_is_owner() or public.pilot_member(id));
create policy memberships_read on public.institution_memberships for select to authenticated
using (public.pilot_is_owner() or public.pilot_member(institution_id));
create policy licenses_read on public.institution_licenses for select to authenticated
using (public.pilot_is_owner() or public.pilot_member(institution_id));
create policy categories_read on public.categories for select to authenticated
using (public.pilot_member(institution_id));
create policy categories_write on public.categories for all to authenticated
using (public.pilot_member(institution_id,true)) with check (public.pilot_member(institution_id,true));
create policy players_read on public.players for select to authenticated
using (public.pilot_member(institution_id));
create policy players_write on public.players for all to authenticated
using (public.pilot_member(institution_id)) with check (public.pilot_member(institution_id));
create policy sessions_read on public.training_sessions for select to authenticated
using (public.pilot_member(institution_id));
create policy sessions_write on public.training_sessions for all to authenticated
using (public.pilot_member(institution_id)) with check (public.pilot_member(institution_id));
create policy attendance_read on public.attendance for select to authenticated
using (public.pilot_member(institution_id));
create policy attendance_write on public.attendance for all to authenticated
using (public.pilot_member(institution_id)) with check (public.pilot_member(institution_id));

-- Explicit table privileges prevent writes even if a future policy is accidentally broadened.
revoke all on public.platform_owners, public.activation_codes, public.license_events from anon,authenticated;
revoke all on public.institutions, public.institution_memberships, public.institution_licenses from anon,authenticated;
grant select on public.institutions, public.institution_memberships, public.institution_licenses to authenticated;
revoke all on public.categories, public.players, public.training_sessions, public.attendance from anon,authenticated;
grant select,insert,update,delete on public.categories, public.players, public.training_sessions, public.attendance to authenticated;

-- Bootstrap: after owner signs up and verifies email, a database administrator inserts
-- the verified auth.users ID into platform_owners via SQL editor. Never store a password.
create function public.pilot_issue_code(p_institution uuid, p_email text, p_hours int default 48)
returns text language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  if not public.pilot_is_owner() then raise exception 'Only platform owner can issue codes'; end if;
  if p_hours < 1 or p_hours > 168 then raise exception 'Invalid duration'; end if;
  if not exists(select 1 from public.institutions where id=p_institution) then raise exception 'Unknown institution'; end if;
  if lower(btrim(p_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid email'; end if;
  update public.activation_codes set revoked_at=now()
  where institution_id=p_institution and email=lower(btrim(p_email)) and redeemed_at is null and revoked_at is null;
  v_code := encode(extensions.gen_random_bytes(24),'hex');
  insert into public.activation_codes(institution_id,email,code_hash,expires_at)
  values(p_institution,lower(btrim(p_email)),encode(extensions.digest(v_code,'sha256'),'hex'),now()+make_interval(hours=>p_hours));
  insert into public.license_events(institution_id,actor_id,event) values(p_institution,auth.uid(),'code_issued');
  return v_code; -- show once; never log this return value
end $$;

create function public.pilot_set_license(p_institution uuid, p_expires timestamptz, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.pilot_is_owner() then raise exception 'Only platform owner can manage licenses'; end if;
  if p_active and (p_expires is null or p_expires <= now()) then raise exception 'Expiration must be in the future'; end if;
  insert into public.institution_licenses(institution_id,status,expires_at)
  values(p_institution,case when p_active then 'active' else 'suspended' end,p_expires)
  on conflict(institution_id) do update set status=excluded.status,expires_at=excluded.expires_at,updated_at=now();
  update public.institutions set status=case when p_active then 'active' else 'suspended' end where id=p_institution;
  if not found then raise exception 'Unknown institution'; end if;
  if not p_active then
    update public.activation_codes set revoked_at=now()
    where institution_id=p_institution and redeemed_at is null and revoked_at is null;
  end if;
  insert into public.license_events(institution_id,actor_id,event)
  values(p_institution,auth.uid(),case when p_active then 'license_activated' else 'license_suspended' end);
end $$;

create function public.pilot_redeem_code(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_record public.activation_codes%rowtype; v_email text; v_verified timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
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

create function public.pilot_add_professor(p_institution uuid,p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not public.pilot_member(p_institution,true) then raise exception 'Institution administrator required'; end if;
  select id into v_user from auth.users where lower(email)=lower(btrim(p_email)) and email_confirmed_at is not null;
  if v_user is null then raise exception 'Professor must sign up and verify email first'; end if;
  insert into public.institution_memberships(institution_id,user_id,role) values(p_institution,v_user,'professor');
end $$;
create function public.pilot_list_professors(p_institution uuid)
returns table(user_id uuid,email text,status text) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.pilot_member(p_institution,true) then raise exception 'Institution administrator required'; end if;
  return query select m.user_id,u.email::text,m.status
  from public.institution_memberships m join auth.users u on u.id=m.user_id
  where m.institution_id=p_institution and m.role='professor'
  order by u.email;
end $$;
create function public.pilot_set_professor_status(p_institution uuid,p_user uuid,p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.pilot_member(p_institution,true) then raise exception 'Institution administrator required'; end if;
  update public.institution_memberships set status=case when p_active then 'active' else 'suspended' end
  where institution_id=p_institution and user_id=p_user and role='professor';
  if not found then raise exception 'Professor not found'; end if;
end $$;
create function public.pilot_update_brand(p_institution uuid,p_name text,p_color text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.pilot_member(p_institution,true) then raise exception 'Institution administrator required'; end if;
  if length(btrim(p_name)) not between 2 and 100 or p_color !~ '^#[0-9A-Fa-f]{6}$'
    then raise exception 'Invalid branding'; end if;
  update public.institutions set name=btrim(p_name),primary_color=p_color where id=p_institution;
end $$;
revoke all on function public.pilot_issue_code(uuid,text,int),public.pilot_set_license(uuid,timestamptz,boolean),
  public.pilot_redeem_code(text),public.pilot_add_professor(uuid,text),public.pilot_list_professors(uuid),
  public.pilot_set_professor_status(uuid,uuid,boolean),public.pilot_update_brand(uuid,text,text) from public;
grant execute on function public.pilot_issue_code(uuid,text,int),public.pilot_set_license(uuid,timestamptz,boolean),
  public.pilot_redeem_code(text),public.pilot_add_professor(uuid,text),public.pilot_list_professors(uuid),
  public.pilot_set_professor_status(uuid,uuid,boolean),public.pilot_update_brand(uuid,text,text) to authenticated;

insert into public.institutions(slug,name) values ('jnn','Junín Vóley JNN');
insert into public.institution_licenses(institution_id)
select id from public.institutions where slug='jnn';
commit;
