export function attendanceCsv({ attendance, sessions, categories, players, categoryId = '', date = '' }) {
  const statusNames = { present: 'Presente', late: 'Tarde', absent: 'Ausente' }
  const days = new Map(sessions.map(item => [item.id, item]))
  const categoryNames = new Map(categories.map(item => [item.id, item.name]))
  const playerNames = new Map(players.map(item => [item.id, item.full_name]))
  const escape = value => {
    let text = String(value ?? '')
    // Spreadsheet apps can evaluate formulas after leading whitespace. Keep data literal.
    if (/^[\s\uFEFF]*[=+@-]/u.test(text)) text = `'${text}`
    return `"${text.replaceAll('"','""')}"`
  }
  const rows = [['Fecha','Categoría','Jugador','Estado'],...attendance.filter(mark => {
    const day = days.get(mark.session_id)
    return day && (!categoryId || day.category_id === categoryId) && (!date || day.session_date === date)
  }).map(mark => {
    const day = days.get(mark.session_id)
    return [day?.session_date,categoryNames.get(day?.category_id),playerNames.get(mark.player_id),statusNames[mark.status] ?? mark.status]
  })]
  return '\ufeff' + rows.map(row => row.map(escape).join(';')).join('\r\n')
}

export function attendanceFilename(institutionName, date) {
  const safeName = String(institutionName).normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60) || 'club'
  return `asistencia-${safeName}-${date}.csv`
}
