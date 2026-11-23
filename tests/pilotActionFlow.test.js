import test from 'node:test'
import assert from 'node:assert/strict'
import { performClubAction } from '../src/pilot/actionFlow.js'

test('a failed write is not refreshed or reported as saved', async () => {
  let reads = 0
  await assert.rejects(performClubAction(async () => { throw Error('write failed') }, async () => { reads++ }),/write failed/)
  assert.equal(reads,0)
})

test('a completed write is kept distinct from a subsequent read failure', async () => {
  let writes = 0, reads = 0
  const result = await performClubAction(async () => { writes++ }, async () => { reads++; throw Error('network unavailable') })
  assert.equal(writes,1)
  assert.equal(reads,1)
  assert.equal(result.refreshed,false)
  assert.match(result.error.message,/network unavailable/)
})

test('logout or manual refresh can omit a redundant club read', async () => {
  let actions = 0
  assert.deepEqual(await performClubAction(async () => { actions++ },null),{refreshed:true})
  assert.equal(actions,1)
})
