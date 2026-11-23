const activities = ['training','match','tournament']
const statuses = ['present','late','absent']

export function attendancePayload({ institutionId, categoryId, date, activity, revision, marks, opponent = '', location = '', observation = '' }) {
  if (!institutionId || !categoryId || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !activities.includes(activity)
    || !Number.isSafeInteger(Number(revision)) || Number(revision) < 0) throw Error('Elegí categoría, fecha y actividad.')
  const rows = Object.entries(marks).filter(([,status]) => status)
  if (rows.length > 500 || rows.some(([,status]) => !statuses.includes(status))) throw Error('Las marcas de asistencia no son válidas.')
  return {
    p_institution:institutionId,p_category:categoryId,p_date:date,p_type:activity,
    p_expected_revision:revision,p_marks:rows.map(([player_id,status]) => ({player_id,status})),
    p_opponent:activity === 'match' ? opponent.trim() || null : null,
    p_location:location.trim() || null,p_observation:observation.trim() || null,
  }
}
