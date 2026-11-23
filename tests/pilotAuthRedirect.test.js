import test from 'node:test'
import assert from 'node:assert/strict'
import { PILOT_AUTH_ORIGIN, pilotAuthRedirect } from '../src/pilot/authRedirect.js'

test('email confirmation and recovery use the protected allow-listed pilot alias', () => {
  const deployment = 'https://voley-comercial-junin-piloto-lf3mvrlj4-miga-mia.vercel.app'
  assert.equal(pilotAuthRedirect(deployment,true),`${PILOT_AUTH_ORIGIN}/`)
  assert.notEqual(pilotAuthRedirect(deployment,true),`${deployment}/`)
  assert.equal(pilotAuthRedirect('http://localhost:5173',false),'http://localhost:5173/pilot.html')
})
