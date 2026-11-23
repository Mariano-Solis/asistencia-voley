import React, { useEffect, useRef, useState } from 'react'
import { attendancePayload } from './attendancePayload.js'

const activities = [['training','Entrenamiento'],['match','Partido'],['tournament','Torneo']]
const statuses = [['present','Presente'],['late','Tarde'],['absent','Ausente']]

export function AdvancedAttendance({ client, institution, categories, players, sessions, attendance, canAttend, onRefresh }) {
  const [categoryId,setCategoryId] = useState('')
  const [date,setDate] = useState(() => new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}))
  const [activity,setActivity] = useState('training')
  const [marks,setMarks] = useState({})
  const [opponent,setOpponent] = useState('')
  const [location,setLocation] = useState('')
  const [observation,setObservation] = useState('')
  const [dirty,setDirty] = useState(false)
  const [saving,setSaving] = useState(false)
  const [notice,setNotice] = useState('')
  const savingRef = useRef(false)
  const current = sessions.find(row => row.category_id === categoryId && row.session_date === date && row.activity_type === activity)
  const revision = current?.revision ?? 0
  const roster = players.filter(player => player.category_id === categoryId && player.active)
    .sort((a,b) => a.full_name.localeCompare(b.full_name,'es'))

  useEffect(() => {
    if (dirty) return
    const rows = attendance.filter(row => row.session_id === current?.id)
    setMarks(Object.fromEntries(rows.map(row => [row.player_id,row.status])))
    setOpponent(current?.opponent || '')
    setLocation(current?.event_location || '')
    setObservation(current?.observation || '')
  },[categoryId,date,activity,current?.id,revision,attendance,dirty])

  function select(set,value) {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) return
    setDirty(false); setNotice(''); set(value)
  }
  function edit(set,value) { set(value);setDirty(true);setNotice('') }
  async function save() {
    if (savingRef.current || !canAttend(categoryId) || !roster.length) return
    if (!dirty) { setNotice('No hay cambios para guardar.');return }
    if (current && !window.confirm('Vas a modificar una jornada guardada. ¿Continuar?')) return
    savingRef.current = true;setSaving(true);setNotice('')
    try {
      const payload = attendancePayload({institutionId:institution.id,categoryId,date,activity,revision,
        marks:Object.fromEntries(roster.filter(player => marks[player.id]).map(player => [player.id,marks[player.id]])),
        opponent,location,observation})
      const {error} = await client.rpc('pilot_save_attendance',payload)
      if (error) throw error
      setDirty(false)
      try { await onRefresh();setNotice('Jornada guardada. Podés verla en el historial.') }
      catch { setNotice('La jornada se guardó, pero no se pudo actualizar la pantalla. Tocá «Actualizar» antes de repetirla.') }
    } catch (error) {
      setNotice(/La asistencia cambió/i.test(error.message || '')
        ? 'La asistencia cambió en otra sesión. Revisá los cambios y tocá «Descartar y actualizar».'
        : error.message || 'No se pudo guardar la jornada.')
    } finally { savingRef.current=false;setSaving(false) }
  }
  async function discard() {
    setDirty(false);setNotice('')
    try { await onRefresh() } catch (error) { setNotice(error.message || 'No se pudo actualizar.') }
  }
  return <section><h2>Asistencia</h2><p>Elegí actividad y marcá el grupo. Los cambios se guardan juntos.</p>
    <div className="history-filters">
      <label>Categoría<select value={categoryId} disabled={saving} onChange={event => select(setCategoryId,event.target.value)}><option value="">Elegí una categoría</option>{categories.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>Fecha<input type="date" value={date} disabled={saving} onChange={event => select(setDate,event.target.value)} /></label>
      <label>Actividad<select value={activity} disabled={saving} onChange={event => select(setActivity,event.target.value)}>{activities.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    </div>
    {categoryId && !canAttend(categoryId) && <p>No tenés permiso para registrar asistencia en esta categoría.</p>}
    {categoryId && canAttend(categoryId) && <>
      {activity === 'match' && <label>Rival<input value={opponent} maxLength={120} disabled={saving} onChange={event => edit(setOpponent,event.target.value)} /></label>}
      {activity !== 'training' && <label>Lugar<input value={location} maxLength={160} disabled={saving} onChange={event => edit(setLocation,event.target.value)} /></label>}
      <label>Observaciones<textarea value={observation} maxLength={1500} disabled={saving} onChange={event => edit(setObservation,event.target.value)} /></label>
      {!roster.length && <p>No hay jugadores activos en esta categoría.</p>}
      <ul>{roster.map(player => <li key={player.id}><strong>{player.full_name}</strong><div>{statuses.map(([value,label]) => <button key={value} type="button" disabled={saving} aria-pressed={marks[player.id] === value} onClick={() => edit(setMarks,previous => ({...previous,[player.id]:previous[player.id] === value ? null : value}))}>{label}</button>)}</div></li>)}</ul>
      <button type="button" disabled={saving || !dirty || !roster.length} onClick={save}>{saving ? 'Guardando…' : current ? 'Guardar cambios de la jornada' : 'Guardar jornada'}</button>
      {dirty && <button type="button" disabled={saving} onClick={discard}>Descartar y actualizar</button>}
    </>}
    {notice && <p role="status">{notice}</p>}
  </section>
}
