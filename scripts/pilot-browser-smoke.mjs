// UI-only browser journey. Every Supabase response below is mocked; this is
// NOT a JWT/RLS/Storage test and never uses an actual account or password.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) }
catch {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw new Error('Install Playwright to run the browser smoke test')
  ;({ chromium } = require(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`))
}

const origin = 'https://savptjiwzaypisayulwp.supabase.co'
const port = Number(process.env.PILOT_TEST_PORT || 4176)
assert(Number.isInteger(port) && port >= 1024 && port <= 65535,'Choose a non-privileged local test port')
const club = '10000000-0000-4000-8000-000000000001'
const userId = '20000000-0000-4000-8000-000000000002'
const user = { id:userId, email:'admin@example.test', aud:'authenticated', role:'authenticated', app_metadata:{provider:'email',providers:['email']}, user_metadata:{}, created_at:new Date().toISOString() }
const token = `${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:userId,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.mock-signature`
let role = 'super_admin'
let playerReadOutage = false
let accountSuspended = false
const store = {
  categories:[], players:[], training_sessions:[], attendance:[],
  institution_memberships:[{institution_id:club,role:'super_admin',status:'active'}],
  institutions:[{id:club,slug:'jnn',name:'Junín Vóley JNN',status:'active',primary_color:'#194b77',logo_path:null}],
  institution_licenses:[{institution_id:club,status:'active',expires_at:'2099-12-31T23:59:59Z'}],
}
const corsHeaders = {
  'access-control-allow-origin':'*',
  'access-control-allow-headers':'authorization,apikey,content-type,x-client-info,prefer,accept-profile,content-profile',
  'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS',
}
const json = (body,status=200) => ({status,contentType:'application/json',headers:corsHeaders,body:JSON.stringify(body)})
function filtered(table,url) {
  return store[table].filter(row => [...url.searchParams].every(([key,value]) =>
    ['select','order','limit'].includes(key) || !value.startsWith('eq.') || String(row[key]) === value.slice(3)))
}
function respondRest(method, table, url, request) {
  if (!Object.hasOwn(store,table)) return json({message:'Unknown table'},404)
  if (method === 'GET') return json(filtered(table,url))
  const input = JSON.parse(request.postData() || '{}')
  const representation = (request.headers().prefer || '').includes('return=representation')
  if (method === 'POST') {
    const upsert = (request.headers().prefer || '').includes('resolution=merge-duplicates')
    const items = (Array.isArray(input) ? input : [input]).map(row => {
      const existing = upsert && table === 'attendance' && store.attendance.find(mark =>
        mark.institution_id===row.institution_id && mark.session_id===row.session_id && mark.player_id===row.player_id)
      if (existing) return Object.assign(existing,row)
      const created={id:randomUUID(),...(table === 'players' ? {active:true} : {}),...row}
      store[table].push(created)
      return created
    })
    return json(representation ? items : [],201)
  }
  if (method === 'PATCH') {
    const rows = filtered(table,url)
    rows.forEach(row => Object.assign(row,input))
    return json(representation ? rows : [])
  }
  if (method === 'DELETE') {
    const rows = filtered(table,url)
    store[table] = store[table].filter(row => !rows.includes(row))
    return json(representation ? rows : [])
  }
  return json({message:'Method not mocked'},405)
}

if (await fetch(`http://127.0.0.1:${port}/`).then(() => true, () => false)) {
  throw new Error(`Local test port ${port} is already in use; refusing to test another server`)
}
const originalIndex = readFileSync('dist/index.html')
const build = spawnSync(process.execPath,['scripts/build-pilot.mjs'],{
  cwd:process.cwd(),stdio:'inherit',env:{...process.env,VITE_PILOT_SUPABASE_URL:origin,VITE_PILOT_SUPABASE_ANON_KEY:'sb_publishable_local_browser_test'},
})
if (build.status !== 0) { writeFileSync('dist/index.html',originalIndex); process.exit(build.status || 1) }
const server = spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore'})
let browser
try {
  for (let i=0;i<50;i++) {
    if (server.exitCode !== null) throw new Error('Local pilot server exited before it could serve the test')
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve,100))
    if (i===49) throw new Error('Local pilot server did not start')
  }
  const bundled = chromium.executablePath()
  const executablePath = process.env.PILOT_CHROMIUM_PATH || (existsSync(bundled) ? bundled : existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : bundled)
  browser = await chromium.launch({headless:true,executablePath,args:['--no-sandbox']})
  for (const viewport of [{width:390,height:844,role:'super_admin'},
    {width:1280,height:800,role:'super_admin'}, {width:390,height:844,role:'professor'},
    {width:390,height:844,role:'super_admin',scenario:'read-outage'},
    {width:390,height:844,role:'super_admin',scenario:'suspension'}]) {
    role = viewport.role
    accountSuspended = false
    store.institution_memberships[0].role = role
    for (const table of ['categories','players','training_sessions','attendance']) store[table] = []
    const context = await browser.newContext({viewport,acceptDownloads:true})
    const page = await context.newPage()
    const errors=[]
    const unexpected=[]
    const calls=[]
    page.on('pageerror',error => errors.push(error.message))
    await page.route(`${origin}/**`,async route => {
      const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method()
      let response
      if (method==='OPTIONS') response={status:204,headers:corsHeaders,body:''}
      else if (path==='/auth/v1/token' && method==='POST') response=json({access_token:token,refresh_token:'mock-refresh',token_type:'bearer',expires_in:3600,user})
      else if (path==='/auth/v1/user') response=json(user)
      else if (path==='/auth/v1/logout') response=json({})
      else if (path==='/rest/v1/rpc/pilot_is_owner') response=json(false)
      else if (path==='/rest/v1/rpc/pilot_account_status') response=json([{institution_id:club,institution_name:'Junín Vóley JNN',role,membership_status:accountSuspended?'suspended':'active',institution_status:'active',license_status:'active',expires_at:'2099-12-31T23:59:59Z'}])
      else if (path==='/rest/v1/rpc/pilot_list_professors') response=json([])
      else if (playerReadOutage && path==='/rest/v1/players' && method==='GET') {
        response = json({message:'Temporary simulated read outage'},503)
      }
      else if (path.startsWith('/rest/v1/')) response=respondRest(method,path.split('/')[3],url,request)
      else { unexpected.push(`${method} ${path}`); response=json({message:'Unexpected mocked endpoint'},404) }
      calls.push(`${method} ${path} => ${response.status}`)
      await route.fulfill(response)
    })
    await page.goto(`http://127.0.0.1:${port}/`)
    await page.getByRole('heading',{name:'Ingresar'}).waitFor()
    const login=page.locator('form').filter({has:page.getByRole('heading',{name:'Ingresar'})})
    await login.getByLabel('Correo').fill('admin@example.test')
    await login.getByLabel('Contraseña').fill('clave-ficticia')
    await login.getByRole('button',{name:'Iniciar sesión'}).click()
    try { await page.getByRole('heading',{name:'Asistencia'}).waitFor({timeout:10000}) }
    catch (error) {
      // The account and all endpoints here are fictitious. Never print actual
      // auth headers, token bodies or user-input passwords in CI diagnostics.
      console.error('Mock journey stopped at:',(await page.locator('body').innerText()).slice(0,1500))
      console.error('Mock calls:',calls,'Unexpected mock endpoints:',unexpected,'Page errors:',errors)
      throw error
    }

    if (role === 'professor') {
      assert.equal(await page.getByRole('button',{name:'Profesores'}).count(),0)
      await page.getByRole('button',{name:'Categorías'}).click()
      assert.equal(await page.getByRole('button',{name:'Agregar categoría'}).count(),0)
      await page.getByRole('button',{name:'Identidad'}).click()
      await page.getByText('La identidad de Junín Vóley JNN la configura el administrador del club.').waitFor()
      assert.equal(await page.getByRole('button',{name:'6. Confirmar y guardar'}).count(),0)
      await page.getByRole('button',{name:'Cerrar sesión'}).click()
      await page.getByRole('heading',{name:'Ingresar'}).waitFor()
      assert.deepEqual(errors,[])
      await context.close()
      console.log('PASS mocked professor navigation 390x844')
      continue
    }

    if (viewport.scenario === 'suspension') {
      await page.getByRole('button',{name:'Categorías'}).click()
      accountSuspended = true
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await page.getByRole('heading',{name:'Acceso institucional no disponible'}).waitFor()
      assert.equal(await page.getByRole('button',{name:'Categorías'}).count(),0,'Suspended account must lose the club navigation')
      accountSuspended = false
      await page.getByRole('button',{name:'Comprobar nuevamente'}).click()
      await page.getByRole('button',{name:'Categorías'}).waitFor()
      assert.deepEqual(errors,[])
      await context.close()
      console.log('PASS mocked suspension/reactivation navigation 390x844')
      continue
    }

    if (viewport.scenario === 'read-outage') {
      await page.getByRole('button',{name:'Categorías'}).click()
      await page.getByLabel('Nombre',{exact:true}).fill('Sub18 recuperación')
      await page.getByRole('button',{name:'Agregar categoría'}).click()
      await page.getByText('Sub18 recuperación').waitFor()
      await page.getByRole('button',{name:'Jugadores'}).click()
      await page.getByLabel('Nombre completo').fill('Jugador ficticio recuperación')
      await page.getByLabel('Categoría').first().selectOption(store.categories[0].id)
      playerReadOutage = true
      await page.getByRole('button',{name:'Agregar jugador'}).click()
      try { await page.getByRole('status').getByText(/La operación terminó, pero no se pudieron actualizar/).waitFor({timeout:10000}) }
      catch (error) {
        console.error('Read-outage screen:',(await page.locator('body').innerText()).slice(0,1500))
        console.error('Mock calls:',calls,'Page errors:',errors)
        throw error
      }
      assert.equal(store.players.length,1,'The successful write must not be retried')
      playerReadOutage = false
      await page.getByRole('button',{name:'Actualizar'}).click()
      await page.getByText(/Jugador ficticio recuperación/).waitFor()
      assert.equal(store.players.length,1,'Manual refresh must not repeat the write')
      await page.reload()
      await page.getByRole('heading',{name:'Asistencia'}).waitFor()
      await page.getByRole('button',{name:'Jugadores'}).click()
      await page.getByText(/Jugador ficticio recuperación/).waitFor()
      assert.deepEqual(errors,[])
      await context.close()
      console.log('PASS mocked saved-write/read-outage recovery 390x844')
      continue
    }

    await page.getByRole('button',{name:'Categorías'}).click()
    await page.getByLabel('Nombre',{exact:true}).first().fill(`Sub16 UI ${viewport.width}`)
    await page.getByRole('button',{name:'Agregar categoría'}).click()
    await page.getByText(`Sub16 UI ${viewport.width}`).waitFor()
    await page.getByRole('button',{name:'Editar'}).first().click()
    await page.getByLabel('Nombre',{exact:true}).last().fill(`Sub16 editada ${viewport.width}`)
    await page.getByRole('button',{name:'Guardar cambios'}).click()
    await page.getByText(`Sub16 editada ${viewport.width}`).waitFor()

    await page.getByRole('button',{name:'Jugadores'}).click()
    await page.getByLabel('Nombre completo').first().fill(`Ángela Pérez ${viewport.width}`)
    await page.getByLabel('Categoría').first().selectOption(store.categories.at(-1).id)
    await page.getByRole('button',{name:'Agregar jugador'}).click()
    try { await page.getByRole('status').getByText('Jugador agregado.').waitFor({timeout:10000}) }
    catch (error) {
      console.error('Player add screen:',(await page.locator('body').innerText()).slice(0,1500))
      console.error('Mock calls:',calls,'Page errors:',errors)
      throw error
    }
    await page.getByText(new RegExp(`Ángela Pérez ${viewport.width}`)).waitFor()
    await page.getByLabel('Buscar jugador').fill('NO EXISTE')
    await page.getByText('No hay jugadores que coincidan con los filtros.').waitFor()
    await page.getByLabel('Buscar jugador').fill('ángela')
    await page.getByRole('button',{name:'Editar'}).first().click()
    await page.getByLabel('Nombre completo').last().fill(`Ángela María Pérez ${viewport.width}`)
    await page.getByRole('button',{name:'Guardar cambios'}).click()
    await page.getByRole('status').getByText('Jugador actualizado.').waitFor()
    await page.getByText(new RegExp(`Ángela María Pérez ${viewport.width}`)).waitFor()
    await page.getByRole('button',{name:'Desactivar'}).click()
    await page.getByLabel('Estado').selectOption('inactive')
    await page.getByText(new RegExp(`Ángela María Pérez ${viewport.width}`)).waitFor()
    await page.getByRole('button',{name:'Reactivar'}).click()

    await page.getByRole('button',{name:'Asistencia'}).click()
    await page.getByLabel('Categoría').selectOption(store.categories.at(-1).id)
    const dateInput=page.getByLabel('Fecha')
    const selectedDate=await dateInput.inputValue()
    await dateInput.fill('')
    assert.equal(await page.getByRole('button',{name:'Crear jornada'}).isEnabled(),false,'A session needs a date')
    await dateInput.fill(selectedDate)
    await page.getByRole('button',{name:'Crear jornada'}).click()
    await page.getByRole('button',{name:'Presente'}).last().click()
    await page.getByRole('button',{name:'Tarde'}).last().click()
    await page.getByRole('button',{name:'Ausente'}).last().click()
    await page.getByRole('status').getByText(/Asistencia de Ángela María Pérez.*Ausente/).waitFor()
    await page.getByRole('button',{name:'Historial'}).click()
    await page.getByLabel('Jugador').selectOption(store.players.at(-1).id)
    await page.getByRole('button',{name:/Exportar CSV \(1\)/}).waitFor()
    const downloadPromise=page.waitForEvent('download')
    await page.getByRole('button',{name:/Exportar CSV \(1\)/}).click()
    const download=await downloadPromise
    const fs=await import('node:fs/promises')
    const csv=await fs.readFile(await download.path(),'utf8')
    assert.match(csv,new RegExp(`Ángela María Pérez ${viewport.width}`))
    assert.match(csv,/"Ausente"/)
    await page.reload()
    await page.getByRole('heading',{name:'Asistencia'}).waitFor()
    await page.getByRole('button',{name:'Historial'}).click()
    await page.getByText(/0 presentes \/ 1 registrados/).waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false,'Horizontal overflow')
    assert.deepEqual(errors,[])
    await page.getByRole('button',{name:'Cerrar sesión'}).click()
    await page.getByRole('heading',{name:'Ingresar'}).waitFor()
    await context.close()
    console.log(`PASS mocked browser journey ${viewport.width}x${viewport.height}`)
  }
} finally {
  await browser?.close()
  server.kill('SIGTERM')
  writeFileSync('dist/index.html',originalIndex)
}
