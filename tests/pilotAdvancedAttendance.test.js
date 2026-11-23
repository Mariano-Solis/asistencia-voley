import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const file = name => readFileSync(new URL(`../supabase/pilot/${name}`,import.meta.url),'utf8')
const owner='00000000-0000-4000-8000-000000000001'
const admin='00000000-0000-4000-8000-000000000002'
const foreign='00000000-0000-4000-8000-000000000003'
const teacher='00000000-0000-4000-8000-000000000004'

test('advanced attendance is atomic, versioned and institution-bound (local SQL claims)',async () => {
  const db=new PGlite()
  try {
    await db.exec(`create role authenticated; create role anon;
      create schema auth; create table auth.users(id uuid primary key,email text unique not null,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;
      create schema extensions; create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text unique);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select,insert,update,delete on storage.objects to authenticated;
      create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$
        select decode(left(replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),n*2),'hex') $$;
      create function extensions.digest(value text,algorithm text) returns bytea language sql as $$
        select decode(md5(value),'hex') $$;`)
    await db.exec(file('001_isolated_pilot.sql').replace('create extension if not exists pgcrypto with schema extensions;',''))
    for(const name of ['003_account_status_and_audit.sql','004_owner_institution_creation.sql',
      '005_owner_activation_hardening.sql','008_universal_identity.sql',
      '009_sports_tenant_and_history_guards.sql','010_sports_history_delete_guards.sql',
      '012_preflight_backup.sql','012_category_player_parity.sql',
      '013_private_player_photos.sql','014_professor_category_scope.sql',
      '016_attendance_activity_and_atomic_save.sql']) await db.exec(file(name))
    for(const [id,email] of [[owner,'owner@example.test'],[admin,'admin@example.test'],
      [foreign,'other@example.test'],[teacher,'teacher@example.test']])
      await db.query('insert into auth.users values ($1,$2,now())',[id,email])
    const own=(await db.query("select id from public.institutions where slug='jnn'")).rows[0].id
    const other=(await db.query("insert into public.institutions(slug,name,status) values ('other','Otro ficticio','active') returning id")).rows[0].id
    await db.query("update public.institutions set status='active' where id=$1",[own])
    await db.query("update public.institution_licenses set status='active',expires_at=now()+interval '3 days' where institution_id=$1",[own])
    await db.query("insert into public.institution_licenses(institution_id,status,expires_at) values ($1,'active',now()+interval '3 days')",[other])
    await db.query("insert into public.institution_memberships(institution_id,user_id,role) values ($1,$2,'super_admin'),($3,$4,'super_admin'),($1,$5,'professor')",[own,admin,other,foreign,teacher])
    const cat=(await db.query("insert into public.categories(institution_id,name,gender) values ($1,'Sub 16','female') returning id",[own])).rows[0].id
    const foreignCat=(await db.query("insert into public.categories(institution_id,name,gender) values ($1,'Sub 16 ajena','female') returning id",[other])).rows[0].id
    const player=(await db.query("insert into public.players(institution_id,category_id,full_name) values ($1,$2,'Jugadora ensayo') returning id",[own,cat])).rows[0].id
    const foreignPlayer=(await db.query("insert into public.players(institution_id,category_id,full_name) values ($1,$2,'Jugadora ajena') returning id",[other,foreignCat])).rows[0].id
    const as=async (id,action) => {
      await db.exec('set role authenticated')
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
      try { return await action() } finally { await db.exec('reset role') }
    }
    const save=(club,category,type,revision,marks,extra={}) => db.query(
      'select * from public.pilot_save_attendance($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [club,category,'2026-11-23',type,revision,JSON.stringify(marks),extra.opponent??null,extra.location??null,extra.observation??null])
    const mark=(id,status) => [{player_id:id,status}]
    const created=await as(admin,()=>save(own,cat,'training',0,mark(player,'present')))
    assert.equal(created.rows.length,1)
    const first=created.rows[0]
    assert.ok(Number(first.revision)>1)
    await as(admin,()=>assert.rejects(save(own,cat,'training',0,mark(player,'absent')),/cambió/i))
    await as(foreign,()=>assert.rejects(save(own,cat,'training',Number(first.revision),mark(player,'absent')),/no autorizada/i))
    await as(admin,()=>assert.rejects(save(own,cat,'training',Number(first.revision),mark(foreignPlayer,'present')),/otra categoría/i))
    await as(admin,()=>assert.rejects(save(own,cat,'training',Number(first.revision),[...mark(player,'present'),...mark(player,'late')]),/duplicado/i))
    assert.equal((await db.query('select status from public.attendance where institution_id=$1',[own])).rows[0].status,'present')
    const revised=await as(admin,()=>save(own,cat,'training',Number(first.revision),mark(player,'late'),{observation:'Ensayo'}))
    assert.ok(Number(revised.rows[0].revision)>Number(first.revision))
    assert.equal((await db.query('select status from public.attendance where institution_id=$1',[own])).rows[0].status,'late')
    const match=await as(admin,()=>save(own,cat,'match',0,mark(player,'present'),{opponent:'Rival ficticio'}))
    assert.notEqual(match.rows[0].session_id,first.session_id)
    assert.equal((await db.query('select count(*)::int as n from public.training_sessions where institution_id=$1',[own])).rows[0].n,2)
    await as(admin,()=>assert.rejects(db.query('update public.attendance set session_id=$1 where institution_id=$2 and session_id=$3',[match.rows[0].session_id,own,first.session_id]),/mover/i))
    await as(admin,()=>db.query("update public.attendance set status='late' where institution_id=$1 and session_id=$2 and player_id=$3",[own,first.session_id,player]))
    await as(admin,()=>assert.rejects(save(own,cat,'training',Number(revised.rows[0].revision),mark(player,'present')),/cambió/i))
    const latest=(await db.query('select revision from public.training_sessions where id=$1',[first.session_id])).rows[0].revision
    await as(teacher,()=>assert.rejects(save(own,cat,'training',Number(revised.rows[0].revision),mark(player,'absent')),/no autorizada/i))
    await db.query('insert into public.professor_category_permissions(institution_id,user_id,category_id,can_view,can_attendance) values ($1,$2,$3,true,true)',[own,teacher,cat])
    const teachSaved=await as(teacher,()=>save(own,cat,'training',Number(latest),mark(player,'absent')))
    const removed=await as(teacher,()=>save(own,cat,'training',Number(teachSaved.rows[0].revision),[]))
    assert.ok(Number(removed.rows[0].revision)>Number(teachSaved.rows[0].revision))
    assert.equal((await db.query('select count(*)::int as n from public.attendance where session_id=$1',[first.session_id])).rows[0].n,0)
    const restored=await as(admin,()=>save(own,cat,'training',Number(removed.rows[0].revision),mark(player,'present')))
    await db.query('update public.players set active=false where id=$1',[player])
    await as(admin,()=>save(own,cat,'training',Number(restored.rows[0].revision),[]))
    assert.equal((await db.query('select count(*)::int as n from public.attendance where session_id=$1',[first.session_id])).rows[0].n,1,'Inactive player history is retained')
    await db.query("update public.institution_memberships set status='suspended' where institution_id=$1 and user_id=$2",[own,teacher])
    await as(teacher,()=>assert.rejects(save(own,cat,'training',1,mark(player,'present')),/no autorizada/i))
    await db.query("update public.institution_licenses set expires_at=now()-interval '1 day' where institution_id=$1",[own])
    await as(admin,()=>assert.rejects(save(own,cat,'tournament',0,[]),/no autorizada/i))
    assert.equal((await db.query('select count(*)::int as n from public.attendance where institution_id=$1',[other])).rows[0].n,0)
  } finally { await db.close() }
})
