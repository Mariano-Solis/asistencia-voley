import test from 'node:test'
import assert from 'node:assert/strict'
import { matchingActiveMembership, unavailableAccountMessage, usableAccountStatus } from '../src/pilot/accountAccess.js'

test('a suspended or expired first membership does not hide an independently active institution', () => {
  const now = Date.parse('2026-11-23T00:00:00Z')
  const statuses = [
    { institution_id:'suspended',membership_status:'suspended',institution_status:'active',license_status:'active',expires_at:'2026-11-25T00:00:00Z' },
    { institution_id:'expired',membership_status:'active',institution_status:'active',license_status:'active',expires_at:'2026-11-22T00:00:00Z' },
    { institution_id:'usable',membership_status:'active',institution_status:'active',license_status:'active',expires_at:'2026-11-25T00:00:00Z' },
  ]
  assert.equal(usableAccountStatus(statuses,now)?.institution_id,'usable')
  assert.equal(usableAccountStatus(statuses.slice(0,2),now),null)
  assert.equal(usableAccountStatus([],now),null)
})

test('a temporarily missing visible membership is not misreported as an expired license', () => {
  const now = Date.parse('2026-11-23T00:00:00Z')
  const valid = { membership_status:'active',institution_status:'active',license_status:'active',expires_at:'2026-11-25T00:00:00Z' }
  assert.match(unavailableAccountMessage(valid,now),/membresía activa/)
  assert.match(unavailableAccountMessage({...valid,expires_at:'2026-11-22T00:00:00Z'},now),/vencida/)
  assert.match(unavailableAccountMessage({...valid,membership_status:'suspended'},now),/membresía está suspendida/)
  assert.match(unavailableAccountMessage({...valid,license_status:'suspended'},now),/licencia institucional está suspendida/)
})

test('an account status cannot retain a stale club or a mismatched role', () => {
  const status = { institution_id:'current',role:'professor' }
  const memberships = [
    { institution_id:'previous',role:'super_admin',status:'active' },
    { institution_id:'current',role:'super_admin',status:'active' },
    { institution_id:'current',role:'professor',status:'suspended' },
  ]
  assert.equal(matchingActiveMembership(status,memberships),null)
  memberships[2].status = 'active'
  assert.equal(matchingActiveMembership(status,memberships),memberships[2])
  assert.equal(matchingActiveMembership(null,memberships),null)
})
