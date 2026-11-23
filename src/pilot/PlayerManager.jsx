import React, { useState } from 'react'
import { playerDetailsFromForm, suggestedCategory } from './playerDetails.js'
import { PlayerPhoto } from './PlayerPhoto.jsx'

function privateSaveParams(values, institutionId, playerId = null) {
  return { p_institution:institutionId,p_player:playerId,p_category:values.category_id,
    p_first:values.first_name,p_last:values.last_name,p_sex:values.sex,p_dni:values.dni,
    p_birth:values.birth_date,p_team:values.team,p_override:values.category_override }
}

export function PlayerManager({ client, institution, categories, players, attendance, busy, run, insert, announce, onExport, parityEnabled = false, canEditPhotos = false }) {
  const privateEdit = parityEnabled && canEditPhotos
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState('active')
  const [suggestion, setSuggestion] = useState('')
  const shown = players.filter(p => (!search || p.full_name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    && (!categoryId || p.category_id === categoryId) && (status === 'all' || p.active === (status === 'active')))
  return <section><h2>Jugadores</h2>
    <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget, data = new FormData(form); run(async () => {
      if (privateEdit) {
        const values = playerDetailsFromForm(data,categories)
        const { error } = await client.rpc('pilot_save_player',privateSaveParams(values,institution.id))
        if (error) throw error
      } else await insert('players', { institution_id: institution.id, category_id:data.get('category'), full_name:String(data.get('name')).trim() })
      form.reset(); setSuggestion(''); announce('Jugador agregado.')
    }) }}>
      {privateEdit ? <><label>Nombre<input name="first_name" maxLength="80" required /></label><label>Apellido<input name="last_name" maxLength="80" required /></label>
        <label>Rama<select name="sex" defaultValue=""><option value="">Sin especificar</option><option value="female">Femenina</option><option value="male">Masculina</option></select></label>
        <label>DNI opcional<input name="dni" inputMode="numeric" pattern="[0-9]{6,12}" /></label>
        <label>Fecha de nacimiento<input name="birth_date" type="date" max={new Date().toISOString().slice(0, 10)} /></label>
        <label>Equipo opcional<input name="team" maxLength="40" /></label></> : <label>Nombre completo<input name="name" minLength="2" maxLength="120" required /></label>}
      <label>Categoría<select name="category" required value={privateEdit ? suggestion : undefined} defaultValue={privateEdit ? undefined : ''} onChange={privateEdit ? event => setSuggestion(event.target.value) : undefined}><option value="" disabled>Elegí una categoría</option>{categories.filter(c => !parityEnabled || c.active).map(c => <option key={c.id} value={c.id}>{c.name}{parityEnabled && c.gender ? ` · ${c.gender === 'female' ? 'Femenina' : 'Masculina'}` : ''}</option>)}</select></label>
      {privateEdit && <button type="button" onClick={event => { const data = new FormData(event.currentTarget.form), match = suggestedCategory(categories, data.get('birth_date'), data.get('sex')); if (match) { setSuggestion(match.id); announce(`Categoría sugerida: ${match.name}. Podés elegir otra.`) } else announce('No hay categoría activa compatible. Elegila manualmente.') }}>Sugerir categoría por edad</button>}
      <button disabled={busy || !categories.some(c => !parityEnabled || c.active)}>Agregar jugador</button>
    </form>
    <div className="history-filters"><label>Buscar jugador<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre" /></label>
      <label>Filtrar categoría<select value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="">Todas</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Estado<select value={status} onChange={event => setStatus(event.target.value)}><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="all">Todos</option></select></label></div>
    <button type="button" disabled={!shown.length || busy} onClick={() => onExport(shown)}>Exportar jugadores CSV ({shown.length})</button>
    <ul>{shown.map(p => <li key={p.id}>
      <span>{p.full_name} · {categories.find(c => c.id === p.category_id)?.name} · {p.active ? 'Activo' : 'Inactivo'}</span>
      <div><button disabled={busy} onClick={() => setEditing(editing === p.id ? null : p.id)}>{editing === p.id ? 'Cancelar' : 'Editar'}</button>
        <button disabled={busy} onClick={() => run(async () => {
          const { error } = await client.from('players').update({ active: !p.active }).eq('institution_id', institution.id).eq('id', p.id).select('id').single()
          if (error) throw error
          announce(p.active ? 'Jugador desactivado. Su historial se conserva.' : 'Jugador reactivado.')
        })}>{p.active ? 'Desactivar' : 'Reactivar'}</button></div>
      {privateEdit && editing === p.id && <PlayerPhoto client={client} institutionId={institution.id} player={p} canEdit busy={busy} run={run} announce={announce} />}
      {editing === p.id && <form className="inline-editor" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); if (!data.has('category')) data.set('category', p.category_id); run(async () => {
        if (privateEdit) {
          const values = playerDetailsFromForm(data,categories)
          const { data: saved, error } = await client.rpc('pilot_save_player',privateSaveParams(values,institution.id,p.id))
          if (error) throw error
          if (saved !== p.id) throw new Error('No se pudo confirmar la edición.')
        } else {
          const { error } = await client.from('players').update({ full_name:String(data.get('name')).trim(), category_id:String(data.get('category') || p.category_id) })
            .eq('institution_id', institution.id).eq('id', p.id).select('id').single()
          if (error) throw error
        }
        setEditing(null); announce('Jugador actualizado.')
      }) }}>
        {privateEdit ? <><label>Nombre<input name="first_name" defaultValue={p.first_name || ''} maxLength="80" required /></label><label>Apellido<input name="last_name" defaultValue={p.last_name || ''} maxLength="80" required /></label>
          {(!p.first_name || !p.last_name) && <p>Registro anterior: completá nombre y apellido al guardar.</p>}
          <label>Rama<select name="sex" defaultValue={p.sex || ''}><option value="">Sin especificar</option><option value="female">Femenina</option><option value="male">Masculina</option></select></label>
          <label>DNI opcional<input name="dni" inputMode="numeric" pattern="[0-9]{6,12}" defaultValue={p.dni || ''} /></label><label>Nacimiento<input name="birth_date" type="date" defaultValue={p.birth_date || ''} /></label><label>Equipo<input name="team" maxLength="40" defaultValue={p.team || ''} /></label></> : <label>Nombre completo<input name="name" defaultValue={p.full_name} minLength="2" maxLength="120" required /></label>}
        <label>Categoría<select name="category" defaultValue={p.category_id} disabled={attendance.some(a => a.player_id === p.id)}>
          {categories.filter(c => !parityEnabled || c.active || c.id === p.category_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        {attendance.some(a => a.player_id === p.id) && <p>La categoría se conserva para proteger el historial de asistencia.</p>}
        <button disabled={busy}>Guardar cambios</button>
      </form>}
    </li>)}</ul>
    {!shown.length && <p>{players.length ? 'No hay jugadores que coincidan con los filtros.' : 'Agregá el primer jugador en una categoría.'}</p>}
  </section>
}
