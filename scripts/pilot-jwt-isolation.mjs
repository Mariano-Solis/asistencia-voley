import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { assertDenied } from './pilotAuditAssertions.mjs'

// Execute only with two real, email-verified Supabase Auth sessions. This file
// has no owner/admin key and never prints JWTs, activation codes or emails.
const origin = 'https://savptjiwzaypisayulwp.supabase.co'
const apiKey = process.env.PILOT_PUBLISHABLE_KEY
const jwtA = process.env.PILOT_JNN_JWT
const jwtB = process.env.PILOT_CLUB_B_JWT
if (!apiKey || !jwtA || !jwtB || apiKey.startsWith('sb_secret_')) {
  throw new Error('Provide a publishable key and two distinct user JWTs through the process environment')
}
function claims(jwt) {
  try { return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()) }
  catch { throw new Error('A user JWT is malformed') }
}
const a = claims(jwtA), b = claims(jwtB)
let keyRole = ''
try { keyRole = claims(apiKey).role } catch { /* new publishable keys are opaque */ }
assert.notEqual(keyRole,'service_role','A service-role key must never be used for this test')
assert(a.sub && b.sub && a.sub !== b.sub, 'Two distinct Auth users required')
assert(a.role === 'authenticated' && b.role === 'authenticated', 'Use authenticated user sessions')
assert(a.iss === `${origin}/auth/v1` && b.iss === `${origin}/auth/v1`, 'JWTs must belong to the isolated commercial project')
assert(a.exp > Date.now()/1000 && b.exp > Date.now()/1000, 'Refresh expired user sessions')

async function request(jwt, path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(origin + path, {
    method, headers: {
      apikey: apiKey, Authorization: `Bearer ${jwt}`,
      ...(body && !(body instanceof Uint8Array) ? {'Content-Type':'application/json'} : {}),
      ...headers,
    },
    body: body instanceof Uint8Array ? body : body === undefined ? undefined : JSON.stringify(body),
  })
  const bytes = new Uint8Array(await response.arrayBuffer())
  let data = null
  if (response.headers.get('content-type')?.includes('application/json')) {
    try { data = JSON.parse(Buffer.from(bytes).toString()) } catch { /* keep status only */ }
  }
  return { status: response.status, ok: response.ok, data, bytes }
}
const rest = (jwt, table, search = '', options = {}) => request(jwt, `/rest/v1/${table}${search}`, options)
const eq = (column, value) => `${column}=eq.${encodeURIComponent(value)}`
function rows(result, expected, label) {
  assert(result.ok && Array.isArray(result.data) && result.data.length === expected, `${label}: unexpected status or row count (${result.status})`)
  return result.data
}
const denied = assertDenied
const results = []
function pass(label) { results.push(label) }
const accounts = [{label:'JNN',jwt:jwtA},{label:'B',jwt:jwtB}]
const fixture = new Map()
const cleanupWarnings = []
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64'))
const stamp = randomUUID().slice(0, 8)

try {
  for (const account of accounts) {
    const memberships = rows(await rest(account.jwt,'institution_memberships','?select=institution_id,role,status'),1,`${account.label} membership`)
    assert.equal(memberships[0].role,'super_admin')
    assert.equal(memberships[0].status,'active')
    account.institution = memberships[0].institution_id
    account.identity = rows(await rest(account.jwt,'institutions',`?select=id,slug,name,primary_color,secondary_color,accent_color,background_color,surface_color,logo_path,visual_mode&${eq('id',account.institution)}`),1,`${account.label} institution`)[0]
    const ownerCheck = await request(account.jwt,'/rest/v1/rpc/pilot_is_owner',{method:'POST',body:{}})
    assert(ownerCheck.ok && ownerCheck.data === false,`${account.label} must not have owner privileges`)
    denied(await request(account.jwt,'/rest/v1/rpc/pilot_owner_events',{
      method:'POST',body:{p_institution:account.institution,p_limit:1},
    }),`${account.label} owner audit access`)
    pass(`${account.label}: verified own institution`)
  }
  assert.notEqual(accounts[0].institution, accounts[1].institution, 'Institutions must differ')

  for (const account of accounts) {
    const institution_id = account.institution
    const category = rows(await rest(account.jwt,'categories','?select=id',{
      method:'POST',headers:{Prefer:'return=representation'},body:{institution_id,name:`Ensayo JWT ${stamp} ${account.label}`},
    }),1,`${account.label} own category`)[0].id
    fixture.set(account.label,{category})
    const categoryName = `Ensayo JWT editado ${stamp} ${account.label}`
    const editedCategory = rows(await rest(account.jwt,'categories',`?select=id,name&${eq('id',category)}`,{
      method:'PATCH',headers:{Prefer:'return=representation'},body:{name:categoryName},
    }),1,`${account.label} own category edit`)[0]
    assert.equal(editedCategory.name,categoryName,`${account.label} own category edit did not persist`)
    const player = rows(await rest(account.jwt,'players','?select=id',{
      method:'POST',headers:{Prefer:'return=representation'},body:{institution_id,category_id:category,full_name:`Jugador ficticio JWT ${stamp}`},
    }),1,`${account.label} own player`)[0].id
    fixture.get(account.label).player = player
    const playerName = `Jugador ficticio JWT ${stamp} ${account.label}`
    const editedPlayer = rows(await rest(account.jwt,'players',`?select=id,full_name&${eq('id',player)}`,{
      method:'PATCH',headers:{Prefer:'return=representation'},body:{full_name:playerName},
    }),1,`${account.label} own player edit`)[0]
    assert.equal(editedPlayer.full_name,playerName,`${account.label} own player edit did not persist`)
    const date = new Date().toISOString().slice(0,10)
    const session = rows(await rest(account.jwt,'training_sessions','?select=id',{
      method:'POST',headers:{Prefer:'return=representation'},body:{institution_id,category_id:category,session_date:date},
    }),1,`${account.label} own session`)[0].id
    fixture.get(account.label).session = session
    rows(await rest(account.jwt,'attendance','?select=session_id',{
      method:'POST',headers:{Prefer:'return=representation'},body:{institution_id,session_id:session,player_id:player,status:'present'},
    }),1,`${account.label} own attendance`)
    rows(await rest(account.jwt,'attendance',`?select=player_id,status&${eq('session_id',session)}`,{
      method:'PATCH',headers:{Prefer:'return=representation'},body:{status:'late'},
    }),1,`${account.label} own attendance update`)
    const path = `${institution_id}/${randomUUID()}.png`
    const uploaded = await request(account.jwt,`/storage/v1/object/pilot-branding/${path}`,{
      method:'POST',body:png,headers:{'Content-Type':'image/png','x-upsert':'false'},
    })
    assert(uploaded.ok,`${account.label} own Storage upload failed (${uploaded.status})`)
    fixture.get(account.label).logo = path
    const downloaded = await request(account.jwt,`/storage/v1/object/authenticated/pilot-branding/${path}`)
    assert(downloaded.ok && Buffer.from(downloaded.bytes).equals(Buffer.from(png)),`${account.label} own Storage content mismatch (${downloaded.status})`)
    const signed = await request(account.jwt,`/storage/v1/object/sign/pilot-branding/${path}`,{
      method:'POST',body:{expiresIn:60},
    })
    assert(signed.ok && signed.data?.signedURL,`${account.label} own Storage signed URL failed (${signed.status})`)
    pass(`${account.label}: own category/player create and edit, attendance create and edit, private file`)
  }

  for (const account of accounts) {
    const other = accounts.find(item => item !== account)
    const target = fixture.get(other.label)
    for (const table of ['institutions','institution_memberships','institution_licenses','categories','players','training_sessions','attendance']) {
      const column = table === 'institutions' ? 'id' : 'institution_id'
      rows(await rest(account.jwt,table,`?select=*&${eq(column,other.institution)}`),0,`${account.label} foreign ${table} read`)
    }
    pass(`${account.label}: foreign institution, roles, license and sports reads denied`)
    const foreignCategory = await rest(account.jwt,'categories','?select=id',{
      method:'POST',headers:{Prefer:'return=representation'},body:{institution_id:other.institution,name:`Invasión ${stamp}`},
    })
    if (foreignCategory.ok && foreignCategory.data?.[0]?.id) (target.unexpectedCategories ??= []).push(foreignCategory.data[0].id)
    denied(foreignCategory,`${account.label} foreign category insert`)
    const foreignPlayer = await rest(account.jwt,'players','?select=id',{
      method:'POST',headers:{Prefer:'return=representation'},body:{institution_id:other.institution,category_id:target.category,full_name:'Intruso ficticio'},
    })
    if (foreignPlayer.ok && foreignPlayer.data?.[0]?.id) (target.unexpectedPlayers ??= []).push(foreignPlayer.data[0].id)
    denied(foreignPlayer,`${account.label} foreign player insert`)
    denied(await rest(account.jwt,'players',`?${eq('id',target.player)}&select=id`,{
      method:'PATCH',headers:{Prefer:'return=representation'},body:{full_name:'Modificación indebida'},
    }),`${account.label} foreign player edit`)
    denied(await rest(account.jwt,'players',`?${eq('id',target.player)}&select=id`,{
      method:'DELETE',headers:{Prefer:'return=representation'},
    }),`${account.label} foreign player delete`)
    denied(await rest(account.jwt,'players',`?${eq('id',fixture.get(account.label).player)}&select=id`,{
      method:'PATCH',headers:{Prefer:'return=representation'},body:{institution_id:other.institution},
    }),`${account.label} change institution_id`)
    denied(await rest(account.jwt,'institution_memberships',`?${eq('institution_id',other.institution)}&select=user_id`,{
      method:'PATCH',headers:{Prefer:'return=representation'},body:{role:'super_admin'},
    }),`${account.label} foreign role edit`)
    denied(await rest(account.jwt,'institution_licenses',`?${eq('institution_id',other.institution)}&select=institution_id`,{
      method:'PATCH',headers:{Prefer:'return=representation'},body:{status:'active'},
    }),`${account.label} foreign license edit`)
    const identity = other.identity
    const foreignIdentity = await request(account.jwt,'/rest/v1/rpc/pilot_update_identity',{
      method:'POST',body:{p_institution:other.institution,p_name:identity.name,p_primary:identity.primary_color,p_secondary:identity.secondary_color,p_accent:identity.accent_color,p_background:identity.background_color,p_surface:identity.surface_color,p_logo_path:identity.logo_path,p_mode:identity.visual_mode},
    })
    assert.equal(foreignIdentity.status,400,`${account.label} foreign identity RPC must run and reject access`)
    assert.equal(foreignIdentity.data?.message,'Institution administrator required',`${account.label} identity RPC rejected for an unexpected reason`)
    const foreignDownload = await request(account.jwt,`/storage/v1/object/authenticated/pilot-branding/${target.logo}`)
    denied(foreignDownload,`${account.label} foreign private file download`)
    const foreignSign = await request(account.jwt,`/storage/v1/object/sign/pilot-branding/${target.logo}`,{
      method:'POST',body:{expiresIn:60},
    })
    denied(foreignSign,`${account.label} foreign private file signed URL`)
    const foreignPath = `${other.institution}/${randomUUID()}.png`
    const foreignUpload = await request(account.jwt,`/storage/v1/object/pilot-branding/${foreignPath}`,{
      method:'POST',body:png,headers:{'Content-Type':'image/png','x-upsert':'false'},
    })
    if (foreignUpload.ok) (target.unexpectedLogos ??= []).push(foreignPath)
    denied(foreignUpload,`${account.label} foreign file upload`)
    denied(await request(account.jwt,`/storage/v1/object/pilot-branding/${target.logo}`,{
      method:'PUT',body:png,headers:{'Content-Type':'image/png'},
    }),`${account.label} foreign file update`)
    const intact = rows(await rest(other.jwt,'players',`?select=id,full_name&${eq('id',target.player)}`),1,`${other.label} own player still exists`)
    assert.equal(intact[0].full_name,`Jugador ficticio JWT ${stamp} ${other.label}`,`${other.label} player changed across institutions`)
    pass(`${account.label}: foreign writes, role, license, identity and Storage denied`)
  }
} finally {
  // Unique fixture IDs only. If cleanup fails, report the failure without
  // printing JWTs or touching any pre-existing rows.
  for (const account of accounts) {
    const f = fixture.get(account.label)
    if (!f) continue
    const own = account.jwt
    const remove = async (label,action, expectedRows) => {
      try {
        const response = await action()
        if (!response.ok || (expectedRows && (!Array.isArray(response.data) || response.data.length !== expectedRows))) cleanupWarnings.push(`${account.label} ${label}`)
      }
      catch { cleanupWarnings.push(`${account.label} ${label}`) }
    }
    for (const path of f.unexpectedLogos || []) await remove('unexpected foreign logo',() => request(own,'/storage/v1/object/pilot-branding',{method:'DELETE',body:{prefixes:[path]}}))
    for (const id of f.unexpectedPlayers || []) await remove('unexpected foreign player',() => rest(own,'players',`?${eq('id',id)}`,{method:'DELETE'}))
    for (const id of f.unexpectedCategories || []) await remove('unexpected foreign category',() => rest(own,'categories',`?${eq('id',id)}`,{method:'DELETE'}))
    if (f.logo) {
      await remove('logo',() => request(own,'/storage/v1/object/pilot-branding',{method:'DELETE',body:{prefixes:[f.logo]}}))
      try {
        const check = await request(own,`/storage/v1/object/authenticated/pilot-branding/${f.logo}`)
        if (check.status !== 404) cleanupWarnings.push(`${account.label} logo still accessible (${check.status})`)
      } catch { cleanupWarnings.push(`${account.label} logo cleanup could not be checked`) }
    }
    if (f.session && f.player) await remove('attendance',() => rest(own,'attendance',`?select=player_id&${eq('session_id',f.session)}&${eq('player_id',f.player)}`,{method:'DELETE',headers:{Prefer:'return=representation'}}),1)
    if (f.session) await remove('session',() => rest(own,'training_sessions',`?select=id&${eq('id',f.session)}`,{method:'DELETE',headers:{Prefer:'return=representation'}}),1)
    if (f.player) await remove('player',() => rest(own,'players',`?select=id&${eq('id',f.player)}`,{method:'DELETE',headers:{Prefer:'return=representation'}}),1)
    if (f.category) await remove('category',() => rest(own,'categories',`?select=id&${eq('id',f.category)}`,{method:'DELETE',headers:{Prefer:'return=representation'}}),1)
  }
  if (cleanupWarnings.length) console.error('CLEANUP_PENDING',cleanupWarnings.join(', '))
}
if (cleanupWarnings.length) throw new Error('Cleanup incomplete; inspect fictitious fixtures before retrying')
console.log(JSON.stringify({result:'PASS',checks:results}))
