import test from 'node:test'
import assert from 'node:assert/strict'
import { usableAccountStatus } from '../src/pilot/accountAccess.js'

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
