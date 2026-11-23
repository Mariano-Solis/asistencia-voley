const LEGACY_BOARD = 'mgsm-quick-tactical-board:v1'
const LEGACY_PRESETS = 'mgsm-quick-tactical-board-presets:v1'

export function boardStorageKeys(institutionId, userId) {
  if (!institutionId && !userId) return { board:LEGACY_BOARD, presets:LEGACY_PRESETS }
  if (!/^[a-f0-9-]{36}$/i.test(institutionId || '') || !/^[a-f0-9-]{36}$/i.test(userId || '')) {
    throw new Error('La pizarra requiere institución y usuario válidos.')
  }
  const scope = `${institutionId}:${userId}`
  return {board:`voley-commercial-board:${scope}`,presets:`voley-commercial-board-presets:${scope}`}
}
