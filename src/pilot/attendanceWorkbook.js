import { exportAttendanceWorkbook } from '../xlsxCategoryExport.js'

const labels = {training:'Entrenamiento',match:'Partido',tournament:'Torneo'}
const states = {present:'Presente',late:'Tarde',absent:'Ausente'}

// No privileged queries: every input comes from the current, institution
// filtered PostgREST reads, and this adapter checks that boundary again.
export function attendanceWorkbookPayload({
  institution,categories,sessions,attendance,players,categoryId,from,to,
  playerId = '',activity = '',now = new Date(),
}) {
  if (!institution?.id || !categoryId || !/^\d{4}-\d{2}-\d{2}$/.test(from || '')
    || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || from > to) {
    throw new Error('Seleccioná una categoría y un período válido.')
  }
  const category = categories.find(c => c.id === categoryId && c.institution_id === institution.id)
  if (!category) throw new Error('La categoría no está disponible para tu institución.')
  const days = sessions.filter(s => s.institution_id === institution.id && s.category_id === categoryId
    && s.session_date >= from && s.session_date <= to
    && (!activity || (s.activity_type || 'training') === activity))
    .sort((a,b) => a.session_date.localeCompare(b.session_date) || a.id.localeCompare(b.id))
  const ids = new Set(days.map(s => s.id))
  const marks = attendance.filter(a => a.institution_id === institution.id && ids.has(a.session_id)
    && (!playerId || a.player_id === playerId) && states[a.status])
  if (!marks.length) throw new Error('No hay asistencias visibles en ese período.')
  const names = new Map(players.filter(p => p.institution_id === institution.id).map(p => [p.id,p.full_name]))
  const playerIds = [...new Set(marks.map(a => a.player_id))]
    .sort((a,b) => (names.get(a) || '').localeCompare(names.get(b) || '','es') || a.localeCompare(b))
  const statusByKey = new Map(marks.map(a => [a.session_id+':'+a.player_id,a.status]))
  const totals = {present:0,late:0,absent:0}
  const playerRows = playerIds.map(id => {
    const counts = {present:0,late:0,absent:0}
    const statuses = days.map(day => {
      const status = statusByKey.get(day.id+':'+id)
      if (status) { counts[status]++; totals[status]++ }
      return states[status] || '—'
    })
    return {name:names.get(id) || 'Jugador no disponible',payment:'—',statuses,...counts}
  })
  const name = String(institution.name || 'Institución').trim()
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60) || 'institucion'
  return {
    appName:name,publisher:name,categoryLabel:category.name,
    periodLabel:`${from} → ${to}`,
    exportDate:now.toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'}),
    paymentColumnLabel:'Cuotas no incluidas',
    sessionColumns:days.map(s => ({id:s.id,label:`${s.session_date} · ${labels[s.activity_type || 'training'] || 'Actividad'}`})),
    playerRows,totals,
    filename:`informe-asistencia-${slug}-${from}-a-${to}.xlsx`,
  }
}

export function downloadAttendanceReport(args) {
  exportAttendanceWorkbook(attendanceWorkbookPayload(args))
}
