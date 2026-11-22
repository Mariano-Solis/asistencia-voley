import React, { useState } from 'react'

export function PlayerManager({ client, institution, categories, players, attendance, busy, run, insert }) {
  const [editing, setEditing] = useState(null)
  return <section><h2>Jugadores</h2>
    <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget, data = new FormData(form); run(async () => {
      await insert('players', { institution_id: institution.id, category_id: data.get('category'), full_name: String(data.get('name')).trim() })
      form.reset()
    }) }}>
      <label>Nombre completo<input name="name" minLength="2" maxLength="120" required /></label>
      <label>Categoría<select name="category" required defaultValue=""><option value="" disabled>Elegí una categoría</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <button disabled={busy || !categories.length}>Agregar jugador</button>
    </form>
    <ul>{players.map(p => <li key={p.id}>
      <span>{p.full_name} · {categories.find(c => c.id === p.category_id)?.name} · {p.active ? 'Activo' : 'Inactivo'}</span>
      <div><button disabled={busy} onClick={() => setEditing(editing === p.id ? null : p.id)}>{editing === p.id ? 'Cancelar' : 'Editar'}</button>
        <button disabled={busy} onClick={() => run(async () => {
          const { error } = await client.from('players').update({ active: !p.active }).eq('institution_id', institution.id).eq('id', p.id).select('id').single()
          if (error) throw error
        })}>{p.active ? 'Desactivar' : 'Reactivar'}</button></div>
      {editing === p.id && <form className="inline-editor" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); run(async () => {
        const { error } = await client.from('players').update({ full_name: String(data.get('name')).trim(), category_id: String(data.get('category') || p.category_id) })
          .eq('institution_id', institution.id).eq('id', p.id).select('id').single()
        if (error) throw error
        setEditing(null)
      }) }}>
        <label>Nombre completo<input name="name" defaultValue={p.full_name} minLength="2" maxLength="120" required /></label>
        <label>Categoría<select name="category" defaultValue={p.category_id} disabled={attendance.some(a => a.player_id === p.id)}>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        {attendance.some(a => a.player_id === p.id) && <p>La categoría se conserva para proteger el historial de asistencia.</p>}
        <button disabled={busy}>Guardar cambios</button>
      </form>}
    </li>)}</ul>
  </section>
}
