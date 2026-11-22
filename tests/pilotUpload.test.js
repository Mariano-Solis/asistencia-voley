import test from 'node:test'
import assert from 'node:assert/strict'
import { validatedLogo } from '../src/pilot/logoUpload.js'

test('rejects disguised and oversized logo uploads before decoding', async () => {
  const disguised = new Blob([new Uint8Array(32)], { type:'image/png' })
  await assert.rejects(validatedLogo(disguised),/PNG, JPG o WebP válido/)
  const oversized = new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type:'image/png' })
  await assert.rejects(validatedLogo(oversized),/4 MB/)
})
