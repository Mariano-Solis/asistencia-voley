import { spawnSync } from 'node:child_process'
import { renameSync } from 'node:fs'
import { resolve } from 'node:path'

if (!process.env.VITE_PILOT_SUPABASE_URL || !process.env.VITE_PILOT_SUPABASE_ANON_KEY) {
  console.error('Missing dedicated pilot Supabase URL and publishable key')
  process.exit(1)
}
const url = process.env.VITE_PILOT_SUPABASE_URL
const key = process.env.VITE_PILOT_SUPABASE_ANON_KEY
if (!/^https:\/\/savptjiwzaypisayulwp\.supabase\.co\/?$/.test(url)) {
  console.error('Pilot requires the dedicated Junín Supabase project URL')
  process.exit(1)
}
let jwtRole = ''
try { jwtRole = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role } catch { /* publishable keys are not JWTs */ }
if (key.startsWith('sb_secret_') || jwtRole === 'service_role') {
  console.error('A service-role or secret key cannot be embedded in a browser build')
  process.exit(1)
}
const result = spawnSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_PILOT_BUILD: '1' }
})
if (result.status !== 0) process.exit(result.status || 1)
renameSync(resolve('dist/pilot.html'), resolve('dist/index.html'))
