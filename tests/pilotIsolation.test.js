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
    const jnnCat = await as(jnnAdmin,async () => (await row("insert into public.categories(institution_id,name) values ($1,'Sub 16') returning id",[jnn])).id)
    const otherCat = await as(otherAdmin,async () => (await row("insert into public.categories(institution_id,name) values ($1,'Sub 18') returning id",[other])).id)
    const jnnPlayer = await as(jnnAdmin,async () => (await row("insert into public.players(institution_id,category_id,full_name) values ($1,$2,'Jugador ficticio') returning id",[jnn,jnnCat])).id)
    const jnnSession = await as(jnnAdmin,async () => (await row('insert into public.training_sessions(institution_id,category_id,session_date) values ($1,$2,current_date) returning id',[jnn,jnnCat])).id)
    await as(jnnAdmin,async () => db.query("insert into public.attendance(institution_id,session_id,player_id,status) values ($1,$2,$3,'present')",[jnn,jnnSession,jnnPlayer]))

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
    const jnnOtherPlayer = await as(jnnAdmin,async () => (await row("insert into public.players(institution_id,category_id,full_name) values ($1,$2,'Otro ficticio') returning id",[jnn,jnnOtherCat])).id)
    await as(jnnAdmin,async () => denied(() => db.query('insert into public.attendance(institution_id,session_id,player_id,status) values ($1,$2,$3,$4)',[jnn,jnnSession,jnnOtherPlayer,'present'])))
    await as(jnnAdmin,async () => db.query('select public.pilot_add_professor($1,$2)',[jnn,'professor@example.test']))
    await as(jnnAdmin,async () => denied(() => db.query('select * from public.pilot_owner_events($1)',[jnn])))
    await as(owner,async () => assert.ok(await count('select count(*) from public.pilot_owner_events($1)',[jnn]) >= 3))
    await as(otherAdmin,async () => denied(() => db.query('select * from public.pilot_list_professors($1)',[jnn])))
    await as(jnnAdmin,async () => assert.equal(await count('select count(*) from public.pilot_list_professors($1)',[jnn]),1))
    await as(professor,async () => {
      assert.equal(await count('select count(*) from public.players where institution_id=$1',[jnn]),2)
      await denied(() => db.query("insert into public.categories(institution_id,name) values ($1,'Forbidden')",[jnn]))
      await denied(() => db.query('select public.pilot_set_license($1,now(),false)',[jnn]))
    })
    await as(jnnAdmin,async () => db.query('select public.pilot_set_professor_status($1,$2,false)',[jnn,professor]))
    await as(professor,async () => {
      assert.equal(await count('select count(*) from public.players where institution_id=$1',[jnn]),0)
      assert.equal((await row('select membership_status from public.pilot_account_status()')).membership_status,'suspended')
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
