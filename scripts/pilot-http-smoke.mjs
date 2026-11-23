// A real local HTTP check of the isolated build. This does not execute JS or
// exercise Supabase Auth, and therefore never substitutes a browser/JWT test.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const origin = 'https://savptjiwzaypisayulwp.supabase.co'
const port = Number(process.env.PILOT_TEST_PORT || 4177)
assert(Number.isInteger(port) && port >= 1024 && port <= 65535)
if (await fetch(`http://127.0.0.1:${port}/`).then(() => true, () => false)) {
  throw new Error(`Local test port ${port} is already in use`)
}
const previous = readFileSync('dist/index.html')
let server
try {
  const build = spawnSync(process.execPath,['scripts/build-pilot.mjs'],{
    stdio:'inherit',env:{...process.env,VITE_PILOT_SUPABASE_URL:origin,VITE_PILOT_SUPABASE_ANON_KEY:'sb_publishable_local_http_test'},
  })
  assert.equal(build.status,0,'Isolated pilot build failed')
  server = spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore'})
  let response
  for (let i=0;i<50;i++) {
    if (server.exitCode !== null) throw new Error('Preview server exited')
    try { response = await fetch(`http://127.0.0.1:${port}/`); break } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve,100))
  }
  assert(response?.ok,'Preview server did not serve the pilot')
  const html = await response.text()
  assert.match(html,/<div id="pilot-root"><\/div>/)
  assert.match(html,/<title>Junín Vóley · Piloto<\/title>/)
  const scriptPaths = [...html.matchAll(/<script[^>]+src="(\/assets\/[^"]+)"/g)].map(match=>match[1])
  assert(scriptPaths.length>0,'Pilot entry script missing')
  let js = ''
  for (const path of scriptPaths) {
    const asset = await fetch(`http://127.0.0.1:${port}${path}`)
    assert(asset.ok,`Pilot entry script unavailable: ${path}`)
    js += await asset.text()
  }
  assert(js.includes(origin),'Entry script does not point to commercial Supabase')
  assert(!js.includes('voleysanmartin.com.ar'),'Entry script references the original production domain')
  console.log('PASS isolated pilot HTML and JS served over local HTTP; no browser or JWT exercised')
} finally {
  server?.kill('SIGTERM')
  writeFileSync('dist/index.html',previous)
}
