import React, { useState } from 'react'
import { filteredAttendance } from './exportAttendance.js'

export function AttendanceHistory({ attendance, sessions, categories, players, onExport, advanced = false }) {
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState('')
  const [playerId, setPlayerId] = useState('')
  const [activity, setActivity] = useState('')
  const types = {training:'Entrenamiento',match:'Partido',tournament:'Torneo'}
  const visible = sessions.filter(day => (!categoryId || day.category_id === categoryId) && (!date || day.session_date === date)
    && (!activity || (day.activity_type || 'training') === activity))
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
  const rows = filteredAttendance({ attendance, sessions, categoryId, date, playerId, activity })
  return <section><h2>Historial de asistencia</h2>
    <div className="history-filters">
      <label>Categoría<select value={categoryId} onChange={event => { setCategoryId(event.target.value); setPlayerId('') }}><option value="">Todas</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Fecha<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      {advanced && <label>Actividad<select value={activity} onChange={event => setActivity(event.target.value)}><option value="">Todas</option>{Object.entries(types).map(([key,value]) => <option key={key} value={key}>{value}</option>)}</select></label>}
      <label>Jugador<select value={playerId} onChange={event => setPlayerId(event.target.value)}><option value="">Todos</option>{players.filter(p => !categoryId || p.category_id === categoryId).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
    </div>
    <button disabled={!rows.length} onClick={() => onExport({ categoryId, date, playerId, activity })}>Exportar CSV ({rows.length})</button>
    <ul>{visible.filter(day => rows.some(mark => mark.session_id === day.id)).map(day => <li key={day.id}>{day.session_date} · {categories.find(c => c.id === day.category_id)?.name}{advanced ? ` · ${types[day.activity_type || 'training']}` : ''} · {rows.filter(a => a.session_id === day.id && a.status === 'present').length} presentes / {rows.filter(a => a.session_id === day.id).length} registrados</li>)}</ul>
    {!rows.length && <p>No hay asistencias para este filtro.</p>}
  </section>
}
