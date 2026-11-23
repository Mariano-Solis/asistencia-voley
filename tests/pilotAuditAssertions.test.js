import test from 'node:test'
import assert from 'node:assert/strict'
import { assertDenied } from '../scripts/pilotAuditAssertions.mjs'

test('direct isolation checks reject HTTP 500 rather than counting it as permission denial', () => {
  assert.throws(() => assertDenied({ status:500, ok:false, data:null },'cross club'), /HTTP 500/)
  assert.throws(() => assertDenied({ status:200, ok:true, data:[{id:'foreign'}] },'cross club'), /HTTP 200/)
  assert.doesNotThrow(() => assertDenied({ status:200, ok:true, data:[] },'cross club'))
  assert.doesNotThrow(() => assertDenied({ status:403, ok:false, data:null },'cross club'))
})
