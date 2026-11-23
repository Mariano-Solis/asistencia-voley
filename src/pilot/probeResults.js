export const probeRows = result => !result?.error && Array.isArray(result?.data) ? result.data : null
export const probeZero = result => probeRows(result)?.length === 0

export function identicalBytes(actual, expected) {
  return actual instanceof Uint8Array && expected instanceof Uint8Array
    && actual.length === expected.length && actual.every((byte,index) => byte === expected[index])
}

export function probeDenied(result) {
  if (!result?.error) return probeZero(result)
  const status = Number(result.status ?? result.error.status)
  return [400,401,403,404].includes(status)
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validForeignFixture(own, target) {
  if (!own || !target || own.institution === target.institution) return false
  if (!['institution','category','player','session'].every(field => uuid.test(target[field] || ''))) return false
  return typeof target.name === 'string' && target.name.trim().length >= 2
    && new RegExp(`^${target.institution}/${uuid.source.slice(1,-1)}[.]png$`,'i').test(target.logo || '')
}
