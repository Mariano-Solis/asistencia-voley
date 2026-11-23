export function filteredAttendance({ attendance, sessions, categoryId = '', date = '', playerId = '', activity = '' }) {
  const days = new Map(sessions.map(item => [item.id, item]))
  return attendance.filter(mark => {
    const day = days.get(mark.session_id)
    return day && (!categoryId || day.category_id === categoryId) && (!date || day.session_date === date)
      && (!activity || (day.activity_type || 'training') === activity) && (!playerId || mark.player_id === playerId)
  })
}

export function attendanceCsv({ attendance, sessions, categories, players, categoryId = '', date = '', playerId = '', activity = '', includeActivity = false }) {
  const statusNames = { present: 'Presente', late: 'Tarde', absent: 'Ausente' }
  const activityNames = {training:'Entrenamiento',match:'Partido',tournament:'Torneo'}
  const days = new Map(sessions.map(item => [item.id, item]))
  const categoryNames = new Map(categories.map(item => [item.id, item.name]))
  const playerNames = new Map(players.map(item => [item.id, item.full_name]))
  const rows = [[...['Fecha','Categoría'],...(includeActivity ? ['Actividad'] : []),'Jugador','Estado'],...filteredAttendance({ attendance, sessions, categoryId, date, playerId, activity }).map(mark => {
    const day = days.get(mark.session_id)
    return [day?.session_date,categoryNames.get(day?.category_id),...(includeActivity ? [activityNames[day?.activity_type || 'training'] || ''] : []),playerNames.get(mark.player_id),statusNames[mark.status] ?? mark.status]
  })]
  return csvRows(rows)
}

function csvRows(rows) {
  const escape = value => {
    let text = String(value ?? '')
    // Spreadsheet apps can evaluate formulas after leading whitespace. Keep data literal.
    if (/^[\s\uFEFF]*[=+@-]/u.test(text)) text = `'${text}`
    return `"${text.replaceAll('"','""')}"`
  }
  return '\ufeff' + rows.map(row => row.map(escape).join(';')).join('\r\n')
}

export function playersCsv({ players, categories, detailed = false }) {
  const names = new Map(categories.map(category => [category.id, category.name]))
  const rows = players.map(player => detailed ? [
    player.full_name, player.first_name, player.last_name, player.dni, player.birth_date,
    { female:'Femenina', male:'Masculina' }[player.sex] || '', player.team,
    names.get(player.category_id) || 'Categoría no disponible', player.active ? 'Activo' : 'Inactivo'
  ] : [player.full_name, names.get(player.category_id) || 'Categoría no disponible', player.active ? 'Activo' : 'Inactivo'])
  return csvRows([detailed ? ['Jugador','Nombre','Apellido','DNI','Nacimiento','Rama','Equipo','Categoría','Estado'] : ['Jugador','Categoría','Estado'], ...rows])
}

export function playersFilename(institutionName) {
  return attendanceFilename(institutionName, 'listado').replace(/^asistencia-/, 'jugadores-').replace(/-listado\.csv$/, '.csv')
}

export function attendanceFilename(institutionName, date) {
  const safeName = String(institutionName).normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60) || 'club'
  return `asistencia-${safeName}-${date}.csv`
}
