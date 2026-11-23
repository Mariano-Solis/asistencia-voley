export const probeRows = result => !result?.error && Array.isArray(result?.data) ? result.data : null
export const probeZero = result => probeRows(result)?.length === 0

export function probeDenied(result) {
  if (!result?.error) return probeZero(result)
  const status = Number(result.status ?? result.error.status)
  return [400,401,403,404].includes(status)
}
