import React, { useState } from 'react'

export function PlayerManager({ client, institution, categories, players, attendance, busy, run, insert, announce, onExport }) {
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState('active')
  const shown = players.filter(p => (!search || p.full_name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    && (!categoryId || p.category_id === categoryId) && (status === 'all' || p.active === (status === 'active')))
  return <section><h2>Jugadores</h2>
    <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget, data = new FormData(form); run(async () => {
      await insert('players', { institution_id: institution.id, category_id: data.get('category'), full_name: String(data.get('name')).trim() })
      form.reset(); announce('Jugador agregado.')
    }) }}>
      <label>Nombre completo<input name="name" minLength="2" maxLength="120" required /></label>
      <label>Categoría<select name="category" required defaultValue=""><option value="" disabled>Elegí una categoría</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <button disabled={busy || !categories.length}>Agregar jugador</button>
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
      {editing === p.id && <form className="inline-editor" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); run(async () => {
        const { error } = await client.from('players').update({ full_name: String(data.get('name')).trim(), category_id: String(data.get('category') || p.category_id) })
          .eq('institution_id', institution.id).eq('id', p.id).select('id').single()
        if (error) throw error
        setEditing(null); announce('Jugador actualizado.')
      }) }}>
        <label>Nombre completo<input name="name" defaultValue={p.full_name} minLength="2" maxLength="120" required /></label>
        <label>Categoría<select name="category" defaultValue={p.category_id} disabled={attendance.some(a => a.player_id === p.id)}>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        {attendance.some(a => a.player_id === p.id) && <p>La categoría se conserva para proteger el historial de asistencia.</p>}
        <button disabled={busy}>Guardar cambios</button>
      </form>}
    </li>)}</ul>
    {!shown.length && <p>{players.length ? 'No hay jugadores que coincidan con los filtros.' : 'Agregá el primer jugador en una categoría.'}</p>}
  </section>
}
