import test from 'node:test'
import assert from 'node:assert/strict'
import { attendancePayload } from '../src/pilot/attendancePayload.js'

const input={institutionId:'club-a',categoryId:'category-a',date:'2026-11-23',activity:'match',revision:4,
  marks:{'player-a':'present','player-b':'late','player-c':null},opponent:'  Rival  ',location:' Cancha ',observation:' Nota '}

test('payload includes only marked players and match metadata',() => {
  assert.deepEqual(attendancePayload(input),{
    p_institution:'club-a',p_category:'category-a',p_date:'2026-11-23',p_type:'match',p_expected_revision:4,
    p_marks:[{player_id:'player-a',status:'present'},{player_id:'player-b',status:'late'}],
    p_opponent:'Rival',p_location:'Cancha',p_observation:'Nota',
  })
  assert.equal(attendancePayload({...input,activity:'training'}).p_opponent,null)
})

test('invalid activity, revision, date and status never reach RPC',() => {
  for(const patch of [{activity:'unknown'},{revision:-1},{date:''},{marks:{p:'justified'}}])
    assert.throws(()=>attendancePayload({...input,...patch}))
})
