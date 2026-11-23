import test from 'node:test'
import assert from 'node:assert/strict'
import { deleteEmptyCategory } from '../src/pilot/categoryActions.js'

function fakeClient({ players = 0, sessions = 0, error = null, deletedId = 'category-a' } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      calls.push(table)
      let countQuery = table !== 'categories'
      const query = {
        eq(field, value) { calls.push([table, field, value]); return this },
        select() { return countQuery ? this : Promise.resolve({ data: deletedId ? { id: deletedId } : null, error }) },
        delete() { return this },
        single() { return Promise.resolve({ data: deletedId ? { id: deletedId } : null, error }) },
        then(resolve) { return Promise.resolve({ count: table === 'players' ? players : sessions, error }).then(resolve) }
      }
      // Supabase chaining requires select(...).single() on deletes.
      if (!countQuery) query.select = () => query
      return query
    }
  }
}
const options = client => ({ client, institutionId: 'club-a', category: { id: 'category-a', name: 'Sub 16' } })

test('empty category deletion scopes counts and deletion to institution and id', async () => {
  const client = fakeClient()
  assert.equal(await deleteEmptyCategory({ ...options(client), confirm: () => true }), true)
  for (const table of ['players', 'training_sessions', 'categories']) {
    assert.ok(client.calls.some(call => Array.isArray(call) && call[0] === table && call[1] === 'institution_id' && call[2] === 'club-a'))
    assert.ok(client.calls.some(call => Array.isArray(call) && call[0] === table && call[1] === (table === 'categories' ? 'id' : 'category_id') && call[2] === 'category-a'))
  }
})

test('used categories, failed counts and cancelled confirmation never delete', async () => {
  for (const data of [{ players: 1 }, { sessions: 1 }, { error: Error('access denied') }]) {
    const client = fakeClient(data)
    await assert.rejects(deleteEmptyCategory({ ...options(client), confirm: () => { throw Error('unexpected confirm') } }))
    assert.ok(!client.calls.includes('categories'))
  }
  const client = fakeClient()
  assert.equal(await deleteEmptyCategory({ ...options(client), confirm: () => false }), false)
  assert.ok(!client.calls.includes('categories'))
})

test('a denied or empty deletion must never announce success', async () => {
  for (const data of [{ error: Error('RLS denied') }, { deletedId: null }]) {
    const client = fakeClient(data)
    await assert.rejects(deleteEmptyCategory({ ...options(client), confirm: () => true }))
  }
})
