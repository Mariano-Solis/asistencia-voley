import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

// Local PostgreSQL-WASM integration test. PGlite omits pgcrypto and Supabase Auth;
// both are replaced only in this disposable test database. The production SQL
// remains unchanged and must still be tested in a dedicated Supabase project.
const schema = readFileSync(new URL('../supabase/pilot/001_isolated_pilot.sql', import.meta.url), 'utf8')
const owner = '00000000-0000-4000-8000-000000000001'
const jnnAdmin = '00000000-0000-4000-8000-000000000002'
const otherAdmin = '00000000-0000-4000-8000-000000000003'
const professor = '00000000-0000-4000-8000-000000000004'
const stranger = '00000000-0000-4000-8000-000000000005'

test('isolated pilot: licensing, single-use activation, permissions, foreign keys and RLS', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role authenticated; create role anon;
      create schema auth; create table auth.users (
        id uuid primary key, email text unique not null, email_confirmed_at timestamptz
      );
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      grant usage on schema auth, public to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      create schema extensions;
      create schema storage;
      create table storage.buckets (
        id text primary key, name text, public boolean,
        file_size_limit bigint, allowed_mime_types text[]
      );
      create table storage.objects (
        id uuid primary key default gen_random_uuid(), bucket_id text, name text unique
      );
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select,insert,update,delete on storage.objects to authenticated;
      create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$
        select decode(left(replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''), n*2),'hex')
      $$;
      create function extensions.digest(value text, algorithm text) returns bytea language sql as $$
        select decode(md5(value),'hex')
      $$;`)
    // Test-only digest is deterministic for redemption; crypto properties are
    // supplied by pgcrypto in the real migration and are not tested here.
    const localSchema = schema.replace('create extension if not exists pgcrypto with schema extensions;', '')
    await db.exec(localSchema)
    await db.exec(readFileSync(new URL('../supabase/pilot/003_account_status_and_audit.sql',import.meta.url),'utf8'))
    await db.exec(readFileSync(new URL('../supabase/pilot/004_owner_institution_creation.sql',import.meta.url),'utf8'))
    await db.exec(readFileSync(new URL('../supabase/pilot/005_owner_activation_hardening.sql',import.meta.url),'utf8'))
    await db.exec(readFileSync(new URL('../supabase/pilot/008_universal_identity.sql',import.meta.url),'utf8'))
    await db.exec(readFileSync(new URL('../supabase/pilot/009_sports_tenant_and_history_guards.sql',import.meta.url),'utf8'))
    await db.exec(readFileSync(new URL('../supabase/pilot/010_sports_history_delete_guards.sql',import.meta.url),'utf8'))
    for (const [id,email] of [
      [owner,'owner@example.test'], [jnnAdmin,'jnn@example.test'],
      [otherAdmin,'other@example.test'], [professor,'professor@example.test'],
      [stranger,'stranger@example.test']
    ]) await db.query('insert into auth.users values ($1,$2,now())',[id,email])
    await db.query('insert into public.platform_owners values ($1)',[owner])
    const jnn = (await db.query("select id from public.institutions where slug='jnn'")).rows[0].id
    const other = (await db.query("insert into public.institutions(slug,name) values ('other','Other Vóley') returning id")).rows[0].id
    await db.query('insert into public.institution_licenses(institution_id) values ($1)',[other])

    async function as(id, callback) {
      await db.exec('set role authenticated')
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
      try { return await callback() } finally { await db.exec('reset role') }
    }
    const row = (sql, params=[]) => db.query(sql,params).then(result=>result.rows[0])
    const count = (sql, params=[]) => row(sql,params).then(value=>Number(value.count))
    const denied = async action => assert.rejects(action)

    await as(jnnAdmin, () => denied(() => db.query('select public.pilot_set_license($1,now()+interval \'3 days\',true)',[jnn])))
    await as(jnnAdmin, () => denied(() => db.query("select public.pilot_create_institution('intruder','Intruder')")))
    const pending = await as(owner,async () => (await row("select public.pilot_create_institution('new-club','Nuevo club') as id")).id)
    assert.equal((await row('select status from public.institution_licenses where institution_id=$1',[pending])).status,'pending')
    await as(owner, () => denied(() => db.query('select public.pilot_issue_code($1,$2)',[pending,'jnn@example.test'])))
    await as(owner, () => denied(() => db.query("select public.pilot_create_institution('new-club','Duplicado')")))
    await as(owner, async () => {
      await db.query('select public.pilot_set_license($1,now()+interval \'3 days\',true)',[jnn])
      await db.query('select public.pilot_set_license($1,now()+interval \'3 days\',true)',[other])
    })
    const revokedCode = await as(owner, async () => (await row('select public.pilot_issue_code($1,$2) as code',[jnn,'jnn@example.test'])).code)
    const jnnCode = await as(owner, async () => (await row('select public.pilot_issue_code($1,$2) as code',[jnn,'jnn@example.test'])).code)
    const otherCode = await as(owner, async () => (await row('select public.pilot_issue_code($1,$2) as code',[other,'other@example.test'])).code)
    await as(owner, () => denied(() => db.query('select public.pilot_redeem_code($1)',[jnnCode])))
    await as(jnnAdmin, () => denied(() => db.query('select public.pilot_redeem_code($1)',[revokedCode])))
    await as(stranger, () => denied(() => db.query('select public.pilot_redeem_code($1)',[jnnCode])))
    await as(jnnAdmin, async () => {
      assert.equal((await row('select public.pilot_redeem_code($1) as id',[jnnCode])).id,jnn)
      await denied(() => db.query('select public.pilot_redeem_code($1)',[jnnCode]))
    })
    await as(otherAdmin, async () => assert.equal((await row('select public.pilot_redeem_code($1) as id',[otherCode])).id,other))
    const ownLogo = `${jnn}/11111111-1111-4111-8111-111111111111.webp`
    const foreignLogo = `${other}/22222222-2222-4222-8222-222222222222.webp`
    await as(jnnAdmin,async () => db.query('insert into storage.objects(bucket_id,name) values ($1,$2)',['pilot-branding',ownLogo]))
    await as(otherAdmin,async () => {
      await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)',['pilot-branding',foreignLogo])
      assert.equal(await count('select count(*) from storage.objects where name=$1',[ownLogo]),0)
      await denied(() => db.query('insert into storage.objects(bucket_id,name) values ($1,$2)',['pilot-branding',`${jnn}/33333333-3333-4333-8333-333333333333.webp`]))
      assert.equal((await db.query('delete from storage.objects where name=$1',[ownLogo])).affectedRows,0)
      assert.equal((await db.query('update storage.objects set name=$1 where name=$2',[foreignLogo,ownLogo])).affectedRows,0)
      await denied(() => db.query("select public.pilot_update_identity($1,'Nombre ajeno','#194b77','#e7eef5','#0c765b','#f1f5fa','#ffffff',$2,'manual')",[jnn,ownLogo]))
    })
    await as(jnnAdmin,async () => {
      assert.equal(await count('select count(*) from storage.objects where name=$1',[foreignLogo]),0)
      await denied(() => db.query('update storage.objects set name=$1 where name=$2',[`${other}/44444444-4444-4444-8444-444444444444.webp`,ownLogo]))
      assert.equal(await count('select count(*) from storage.objects where name=$1',[ownLogo]),1)
      await denied(() => db.query("select public.pilot_update_identity($1,'JNN','#194b77','#e7eef5','#0c765b','#f1f5fa','#ffffff',$2,'manual')",[jnn,foreignLogo]))
      await db.query("select public.pilot_update_identity($1,'Junín Vóley JNN','#194b77','#e7eef5','#0c765b','#f1f5fa','#ffffff',$2,'manual')",[jnn,ownLogo])
      assert.equal((await row('select logo_path from public.institutions where id=$1',[jnn])).logo_path,ownLogo)
    })
    const jnnCat = await as(jnnAdmin,async () => (await row("insert into public.categories(institution_id,name) values ($1,'Sub 16') returning id",[jnn])).id)
    const otherCat = await as(otherAdmin,async () => (await row("insert into public.categories(institution_id,name) values ($1,'Sub 18') returning id",[other])).id)
    const jnnPlayer = await as(jnnAdmin,async () => (await row("insert into public.players(institution_id,category_id,full_name) values ($1,$2,'Jugador ficticio') returning id",[jnn,jnnCat])).id)
    const jnnSession = await as(jnnAdmin,async () => (await row('insert into public.training_sessions(institution_id,category_id,session_date) values ($1,$2,current_date) returning id',[jnn,jnnCat])).id)
    await as(jnnAdmin,async () => {
      await denied(() => db.query("insert into public.categories(institution_id,name) values ($1,'Sub 16')",[jnn]))
      await denied(() => db.query("insert into public.categories(institution_id,name) values ($1,'   ')",[jnn]))
      await denied(() => db.query("insert into public.players(institution_id,category_id,full_name) values ($1,$2,'  ')",[jnn,jnnCat]))
      await denied(() => db.query("insert into public.players(institution_id,category_id,full_name) values ($1,$2,'Sin categoría')",[jnn,'ffffffff-ffff-4fff-8fff-ffffffffffff']))
      await denied(() => db.query('insert into public.training_sessions(institution_id,category_id,session_date) values ($1,$2,current_date)',[jnn,jnnCat]))
      assert.equal(await count('select count(*) from public.training_sessions where institution_id=$1 and category_id=$2',[jnn,jnnCat]),1)
    })
    await as(jnnAdmin,async () => db.query("insert into public.attendance(institution_id,session_id,player_id,status) values ($1,$2,$3,'present')",[jnn,jnnSession,jnnPlayer]))
    await as(jnnAdmin,async () => {
      await denied(() => db.query("insert into public.attendance(institution_id,session_id,player_id,status) values ($1,$2,$3,'present')",[jnn,jnnSession,jnnPlayer]))
      await denied(() => db.query("insert into public.attendance(institution_id,session_id,player_id,status) values ($1,$2,$3,'justified')",[jnn,jnnSession,jnnPlayer]))
      await denied(() => db.query("insert into public.attendance(institution_id,session_id,player_id,status) values ($1,$2,$3,'present')",[jnn,'ffffffff-ffff-4fff-8fff-ffffffffffff',jnnPlayer]))
      await db.query("insert into public.attendance(institution_id,session_id,player_id,status) values ($1,$2,$3,'late') on conflict (institution_id,session_id,player_id) do update set status=excluded.status",[jnn,jnnSession,jnnPlayer])
      assert.equal(await count('select count(*) from public.attendance where institution_id=$1 and session_id=$2',[jnn,jnnSession]),1)
      assert.equal((await row('select status from public.attendance where session_id=$1',[jnnSession])).status,'late')
    })
    await as(jnnAdmin, async () => {
      await db.query("update public.categories set name='Sub 16 ensayo' where id=$1",[jnnCat])
      assert.equal((await row('select name from public.categories where id=$1',[jnnCat])).name,'Sub 16 ensayo')
      await db.query("update public.players set full_name='Jugador de Prueba editado' where id=$1",[jnnPlayer])
      assert.equal(await count("select count(*) from public.players where full_name ilike '%prueba editado%' and institution_id=$1",[jnn]),1)
      await db.query("update public.attendance set status='late' where institution_id=$1 and session_id=$2 and player_id=$3",[jnn,jnnSession,jnnPlayer])
      assert.equal((await row('select status from public.attendance where session_id=$1',[jnnSession])).status,'late')
      await db.query("update public.attendance set status='absent' where institution_id=$1 and session_id=$2 and player_id=$3",[jnn,jnnSession,jnnPlayer])
      assert.equal((await row('select status from public.attendance where session_id=$1',[jnnSession])).status,'absent')
      assert.equal(await count('select count(*) from public.attendance a join public.training_sessions s on s.id=a.session_id where s.category_id=$1 and a.player_id=$2',[jnnCat,jnnPlayer]),1)
      await denied(() => db.query('update public.players set category_id=$1 where id=$2',[otherCat,jnnPlayer]))
      await denied(() => db.query('update public.players set institution_id=$1 where id=$2',[other,jnnPlayer]))
      await denied(() => db.query('update public.categories set institution_id=$1 where id=$2',[other,jnnCat]))
      await denied(() => db.query('update public.training_sessions set institution_id=$1 where id=$2',[other,jnnSession]))
      await denied(() => db.query('update public.attendance set institution_id=$1 where session_id=$2',[other,jnnSession]))
      await denied(() => db.query('delete from public.players where id=$1',[jnnPlayer]))
      await denied(() => db.query('delete from public.training_sessions where id=$1',[jnnSession]))
      assert.equal(await count('select count(*) from public.attendance where session_id=$1',[jnnSession]),1)
    })

    await as(otherAdmin, async () => {
      for (const table of ['categories','players','training_sessions','attendance']) {
        assert.equal(await count(`select count(*) from public.${table} where institution_id=$1`,[jnn]),0)
      }
      assert.equal((await db.query("update public.players set full_name='intruso' where id=$1",[jnnPlayer])).affectedRows,0)
      assert.equal((await db.query('delete from public.players where id=$1',[jnnPlayer])).affectedRows,0)
      await denied(() => db.query("insert into public.players(institution_id,category_id,full_name) values ($1,$2,'intruso')",[jnn,jnnCat]))
      await denied(() => db.query("insert into public.players(institution_id,category_id,full_name) values ($1,$2,'intruso')",[other,jnnCat]))
      assert.equal(await count('select count(*) from public.categories where institution_id=$1',[other]),1)
    })
    await as(jnnAdmin,async () => denied(() => db.query("insert into public.players(institution_id,category_id,full_name) values ($1,$2,'intruso')",[jnn,otherCat])))
    await as(jnnAdmin,async () => denied(() => db.query('insert into public.attendance(institution_id,session_id,player_id,status) values ($1,$2,$3,$4)',[other,jnnSession,jnnPlayer,'present'])))
    await as(jnnAdmin,async () => {
      assert.equal(await count('select count(*) from public.categories where institution_id=$1',[other]),0)
      assert.equal((await db.query('delete from public.categories where id=$1',[otherCat])).affectedRows,0)
    })
    const jnnOtherCat = await as(jnnAdmin,async () => (await row("insert into public.categories(institution_id,name) values ($1,'Sub 20') returning id",[jnn])).id)
    await as(jnnAdmin,async () => {
      await denied(() => db.query('update public.players set category_id=$1 where id=$2',[jnnOtherCat,jnnPlayer]))
      await denied(() => db.query('update public.training_sessions set category_id=$1 where id=$2',[jnnOtherCat,jnnSession]))
    })
    const jnnOtherPlayer = await as(jnnAdmin,async () => (await row("insert into public.players(institution_id,category_id,full_name) values ($1,$2,'Otro ficticio') returning id",[jnn,jnnOtherCat])).id)
    await as(jnnAdmin,async () => {
      await db.query('update public.players set category_id=$1 where id=$2',[jnnCat,jnnOtherPlayer])
      assert.equal((await row('select category_id from public.players where id=$1',[jnnOtherPlayer])).category_id,jnnCat)
      await db.query('update public.players set category_id=$1 where id=$2',[jnnOtherCat,jnnOtherPlayer])
    })
    await as(jnnAdmin,async () => denied(() => db.query('insert into public.attendance(institution_id,session_id,player_id,status) values ($1,$2,$3,$4)',[jnn,jnnSession,jnnOtherPlayer,'present'])))
    await as(jnnAdmin,async () => db.query('select public.pilot_add_professor($1,$2)',[jnn,'professor@example.test']))
    await as(jnnAdmin,async () => denied(() => db.query('select * from public.pilot_owner_events($1)',[jnn])))
    await as(owner,async () => assert.ok(await count('select count(*) from public.pilot_owner_events($1)',[jnn]) >= 3))
    await as(otherAdmin,async () => denied(() => db.query('select * from public.pilot_list_professors($1)',[jnn])))
    await as(jnnAdmin,async () => assert.equal(await count('select count(*) from public.pilot_list_professors($1)',[jnn]),1))
    let professorFixture
    await as(professor,async () => {
      assert.equal(await count('select count(*) from public.players where institution_id=$1',[jnn]),2)
      assert.equal(await count('select count(*) from storage.objects where name=$1',[ownLogo]),1)
      await denied(() => db.query('insert into storage.objects(bucket_id,name) values ($1,$2)',['pilot-branding',`${jnn}/55555555-5555-4555-8555-555555555555.webp`]))
      assert.equal(await count('select count(*) from public.players where institution_id=$1',[other]),0)
      await denied(() => db.query("insert into public.categories(institution_id,name) values ($1,'Forbidden')",[jnn]))
      await denied(() => db.query('select public.pilot_set_license($1,now(),false)',[jnn]))
      await denied(() => db.query("select public.pilot_create_institution('professor-club','Club del profesor')"))
      await denied(() => db.query('select public.pilot_issue_code($1,$2)',[jnn,'professor@example.test']))
      await denied(() => db.query('select * from public.pilot_list_professors($1)',[jnn]))
      await denied(() => db.query('select public.pilot_set_professor_status($1,$2,false)',[jnn,professor]))
      await denied(() => db.query("select public.pilot_update_brand($1,'Nombre indebido','#194b77')",[jnn]))
      await denied(() => db.query("update public.institution_memberships set role='super_admin' where user_id=$1",[professor]))
      const own = (await row("insert into public.players(institution_id,category_id,full_name) values ($1,$2,'Jugador del profesor') returning id",[jnn,jnnCat])).id
      await db.query("update public.players set full_name='Jugador del profesor editado' where id=$1",[own])
      assert.equal((await row('select full_name from public.players where id=$1',[own])).full_name,'Jugador del profesor editado')
      const ownSession = (await row("insert into public.training_sessions(institution_id,category_id,session_date) values ($1,$2,current_date+1) returning id",[jnn,jnnCat])).id
      professorFixture = { own, ownSession }
      await db.query("insert into public.attendance(institution_id,session_id,player_id,status) values ($1,$2,$3,'present')",[jnn,ownSession,own])
      assert.equal(await count('select count(*) from public.attendance where session_id=$1',[ownSession]),1)
      assert.equal((await db.query('delete from public.attendance where session_id=$1',[ownSession])).affectedRows,0)
      assert.equal((await db.query('delete from public.training_sessions where id=$1',[ownSession])).affectedRows,0)
      assert.equal((await db.query('delete from public.players where id=$1',[own])).affectedRows,0)
      await denied(() => db.query("insert into public.players(institution_id,category_id,full_name) values ($1,$2,'Intruso')",[other,otherCat]))
    })
    await as(jnnAdmin,async () => {
      const { own, ownSession } = professorFixture
      assert.equal((await db.query('delete from public.attendance where session_id=$1',[ownSession])).affectedRows,1)
      assert.equal((await db.query('delete from public.training_sessions where id=$1',[ownSession])).affectedRows,1)
      assert.equal((await db.query('delete from public.players where id=$1',[own])).affectedRows,1)
    })
    await as(jnnAdmin,async () => db.query('select public.pilot_set_professor_status($1,$2,false)',[jnn,professor]))
    await as(professor,async () => {
      assert.equal(await count('select count(*) from public.players where institution_id=$1',[jnn]),0)
      assert.equal((await row('select membership_status from public.pilot_account_status()')).membership_status,'suspended')
      await denied(() => db.query("insert into public.players(institution_id,category_id,full_name) values ($1,$2,'Suspendido')",[jnn,jnnCat]))
      await denied(() => db.query('select public.pilot_set_professor_status($1,$2,true)',[jnn,professor]))
    })
    await as(jnnAdmin,async () => db.query('select public.pilot_set_professor_status($1,$2,true)',[jnn,professor]))
    await as(professor,async () => assert.equal(await count('select count(*) from public.players where institution_id=$1',[jnn]),2))
    await as(jnnAdmin,async () => {
      await db.query('update public.players set active=false where id=$1',[jnnPlayer])
      await denied(() => db.query('update public.attendance set status=$1 where institution_id=$2 and session_id=$3 and player_id=$4',['late',jnn,jnnSession,jnnPlayer]))
      await db.query('update public.players set active=true where id=$1',[jnnPlayer])
    })
    await as(owner,async () => db.query('select public.pilot_set_license($1,null,false)',[jnn]))
    await as(jnnAdmin,async () => {
      assert.equal(await count('select count(*) from public.players where institution_id=$1',[jnn]),0)
      await denied(() => db.query("insert into public.categories(institution_id,name) values ($1,'Blocked')",[jnn]))
      assert.equal((await row('select license_status from public.pilot_account_status()')).license_status,'suspended')
    })
    await as(owner,async () => db.query('select public.pilot_set_license($1,now()+interval \'3 days\',true)',[jnn]))
    await as(jnnAdmin,async () => assert.equal(await count('select count(*) from public.players where institution_id=$1',[jnn]),2))
    await db.query("update public.institution_licenses set expires_at=now()-interval '1 second' where institution_id=$1",[jnn])
    await as(jnnAdmin,async () => {
      assert.equal(await count('select count(*) from public.players where institution_id=$1',[jnn]),0)
      assert.ok(new Date((await row('select expires_at from public.pilot_account_status()')).expires_at)<new Date())
    })
    await db.query("update public.institution_licenses set expires_at=now()+interval '3 days' where institution_id=$1",[jnn])
    await db.query("update public.institutions set status='suspended' where id=$1",[jnn])
    await as(jnnAdmin,async () => {
      assert.equal(await count('select count(*) from public.players where institution_id=$1',[jnn]),0)
      assert.equal((await row('select institution_status from public.pilot_account_status()')).institution_status,'suspended')
    })
    await as(stranger,async () => assert.equal(await count('select count(*) from public.players'),0))
  } finally { await db.close() }
})
