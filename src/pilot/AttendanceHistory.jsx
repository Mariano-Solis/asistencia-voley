import React, { useState } from 'react'
import { filteredAttendance } from './exportAttendance.js'
import { attendanceStats } from '../attendanceStats.js'
import { downloadAttendanceReport } from './attendanceWorkbook.js'

export function AttendanceHistory({ attendance, sessions, categories, players, institution, onExport, advanced = false }) {
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState('')
  const [playerId, setPlayerId] = useState('')
  const [activity, setActivity] = useState('')
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')
  const [reportMessage, setReportMessage] = useState('')
  const types = {training:'Entrenamiento',match:'Partido',tournament:'Torneo'}
  const visible = sessions.filter(day => (!categoryId || day.category_id === categoryId) && (!date || day.session_date === date)
    && (!activity || (day.activity_type || 'training') === activity))
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
  const rows = filteredAttendance({ attendance, sessions, categoryId, date, playerId, activity })
  const stats = attendanceStats(rows)
  const visibleSessions = new Set(rows.map(row => row.session_id)).size
  return <section><h2>Historial de asistencia</h2>
    <div className="history-filters">
      <label>Categoría<select value={categoryId} onChange={event => { setCategoryId(event.target.value); setPlayerId('') }}><option value="">Todas</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Fecha<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      {advanced && <label>Actividad<select value={activity} onChange={event => setActivity(event.target.value)}><option value="">Todas</option>{Object.entries(types).map(([key,value]) => <option key={key} value={key}>{value}</option>)}</select></label>}
      <label>Jugador<select value={playerId} onChange={event => setPlayerId(event.target.value)}><option value="">Todos</option>{players.filter(p => !categoryId || p.category_id === categoryId).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
    </div>
    <div className="pilot-attendance-summary" aria-label="Resumen de los resultados visibles">
      <p>Resultados del filtro · {visibleSessions} {visibleSessions === 1 ? 'jornada' : 'jornadas'} · {stats.total} {stats.total === 1 ? 'registro' : 'registros'}</p>
      <dl>
        <div><dt>Presentes</dt><dd>{stats.present} · {stats.presentPct}%</dd></div>
        <div><dt>Tarde</dt><dd>{stats.late} · {stats.latePct}%</dd></div>
        <div><dt>Ausentes</dt><dd>{stats.absent} · {stats.absentPct}%</dd></div>
      </dl>
    </div>
    <button disabled={!rows.length} onClick={() => onExport({ categoryId, date, playerId, activity })}>Exportar CSV ({rows.length})</button>
    <fieldset className="pilot-report">
      <legend>Informe XLSX por categoría (sin pagos)</legend>
      <p>Seleccioná una categoría y un período. Solo se incluyen las asistencias visibles para tu cuenta.</p>
      <label>Desde<input type="date" value={reportFrom} onChange={event => setReportFrom(event.target.value)} /></label>
      <label>Hasta<input type="date" value={reportTo} min={reportFrom || undefined} onChange={event => setReportTo(event.target.value)} /></label>
      <button type="button" disabled={!categoryId || !reportFrom || !reportTo} onClick={() => {
        try {
          downloadAttendanceReport({institution,categories,sessions,attendance,players,categoryId,
            from:reportFrom,to:reportTo,playerId,activity})
          setReportMessage('Informe XLSX descargado con las asistencias visibles.')
        } catch (error) { setReportMessage(error.message) }
      }}>Descargar informe XLSX</button>
      {reportMessage && <p role="status">{reportMessage}</p>}
    </fieldset>
    <ul>{visible.filter(day => rows.some(mark => mark.session_id === day.id)).map(day => <li key={day.id}>{day.session_date} · {categories.find(c => c.id === day.category_id)?.name}{advanced ? ` · ${types[day.activity_type || 'training']}` : ''} · {rows.filter(a => a.session_id === day.id && a.status === 'present').length} presentes / {rows.filter(a => a.session_id === day.id).length} registrados</li>)}</ul>
    {!rows.length && <p>No hay asistencias para este filtro.</p>}
  </section>
}
