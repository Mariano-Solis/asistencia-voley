import React, { useState } from 'react'

export function AttendanceHistory({ attendance, sessions, categories, onExport }) {
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState('')
  const visible = sessions.filter(day => (!categoryId || day.category_id === categoryId) && (!date || day.session_date === date))
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
  const count = attendance.filter(mark => visible.some(day => day.id === mark.session_id)).length
  return <section><h2>Historial de asistencia</h2>
    <div className="history-filters">
      <label>Categoría<select value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="">Todas</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Fecha<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    </div>
    <button disabled={!count} onClick={() => onExport({ categoryId, date })}>Exportar CSV ({count})</button>
    <ul>{visible.map(day => <li key={day.id}>{day.session_date} · {categories.find(c => c.id === day.category_id)?.name} · {attendance.filter(a => a.session_id === day.id && a.status === 'present').length} presentes / {attendance.filter(a => a.session_id === day.id).length} registrados</li>)}</ul>
    {!visible.length && <p>No hay jornadas para este filtro.</p>}
  </section>
}
