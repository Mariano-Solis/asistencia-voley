import assert from 'node:assert/strict'

// A server error is a failed test, never evidence that RLS denied access.
export function assertDenied(result, label) {
  const rejected = [400,401,403,404].includes(result.status)
  const hiddenByRls = result.ok && Array.isArray(result.data) && result.data.length === 0
  assert(rejected || hiddenByRls, `${label}: expected a denial, got HTTP ${result.status}`)
}
