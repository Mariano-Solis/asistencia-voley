import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('live Supabase smoke script parses, asserts boundaries and rolls back fixtures', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role authenticated; create role anon;
      create schema auth;
      create table auth.users (id uuid primary key,email text unique not null,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      grant usage on schema auth,public to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;
      create schema extensions;
      create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$
        select decode(left(replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),n*2),'hex')
      $$;
      create function extensions.digest(value text,algorithm text) returns bytea language sql as $$
        select decode(md5(value),'hex')
      $$;`)
    const schema = readFileSync(new URL('../supabase/pilot/001_isolated_pilot.sql',import.meta.url),'utf8')
      .replace('create extension if not exists pgcrypto with schema extensions;','')
    await db.exec(schema)
    await db.exec(readFileSync(new URL('../supabase/pilot/003_account_status_and_audit.sql',import.meta.url),'utf8'))
    await db.exec(readFileSync(new URL('../supabase/pilot/004_owner_institution_creation.sql',import.meta.url),'utf8'))
    await db.exec(readFileSync(new URL('../supabase/pilot/005_owner_activation_hardening.sql',import.meta.url),'utf8'))
    const smoke = readFileSync(new URL('../supabase/pilot/002_live_isolation_smoke.sql',import.meta.url),'utf8')
    const results = await db.exec(smoke)
    assert.match(results.at(-1).rows[0].result,/^PASS:/)
    assert.equal((await db.query('select count(*) from auth.users')).rows[0].count,0)
    assert.equal((await db.query("select status from public.institutions where slug='jnn'")).rows[0].status,'pending')
    await db.exec(readFileSync(new URL('../supabase/pilot/009_sports_tenant_and_history_guards.sql',import.meta.url),'utf8'))
    await db.exec(readFileSync(new URL('../supabase/pilot/010_sports_history_delete_guards.sql',import.meta.url),'utf8'))
    const integrity = readFileSync(new URL('../supabase/pilot/011_integrity_transaction_smoke.sql',import.meta.url),'utf8')
    const integrityResults = await db.exec(integrity)
    assert.equal(integrityResults.at(-1).rows[0].result,'PASS: commercial PostgreSQL integrity; transaction rolled back')
    assert.equal((await db.query("select count(*) from public.institutions where slug='c12-integrity-smoke-20261123'")).rows[0].count,0)
  } finally { await db.close() }
})
