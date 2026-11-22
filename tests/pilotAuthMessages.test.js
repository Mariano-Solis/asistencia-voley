import test from 'node:test'
import assert from 'node:assert/strict'
import { authErrorMessage } from '../src/pilot/authMessages.js'

test('the email quota explains the separate password route without hiding the limit', () => {
  const text = authErrorMessage({ status: 429, message: 'email rate limit exceeded' })
  assert.match(text, /limitó temporalmente el envío de correos/)
  assert.match(text, /contraseña se procesa por separado/)
})

test('a rejected password remains the original Auth error, without guessing the cause', () => {
  assert.equal(authErrorMessage({ status: 400, message: 'Invalid login credentials' }), 'Invalid login credentials')
})
