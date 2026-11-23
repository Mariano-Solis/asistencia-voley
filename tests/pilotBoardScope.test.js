import test from 'node:test'
import assert from 'node:assert/strict'
import { boardStorageKeys } from '../src/boardStorageKeys.js'

const a='10000000-0000-4000-8000-000000000001'
const b='10000000-0000-4000-8000-000000000002'
const user='20000000-0000-4000-8000-000000000002'
const other='20000000-0000-4000-8000-000000000003'

test('pizarra original conserva sus claves y cada club/usuario tiene claves separadas', () => {
  assert.deepEqual(boardStorageKeys(),{
    board:'mgsm-quick-tactical-board:v1',
    presets:'mgsm-quick-tactical-board-presets:v1',
  })
  const own=boardStorageKeys(a,user)
  assert.notEqual(own.board,boardStorageKeys(b,user).board)
  assert.notEqual(own.presets,boardStorageKeys(a,other).presets)
  assert.notEqual(own.board,boardStorageKeys().board)
  assert.throws(()=>boardStorageKeys(a),/válidos/)
  assert.throws(()=>boardStorageKeys('../otro',user),/válidos/)
})
