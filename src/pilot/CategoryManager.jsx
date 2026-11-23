import React, { useState } from 'react'
import { deleteEmptyCategory } from './categoryActions.js'

export function CategoryManager({ client, institution, categories, canEdit, busy, run, insert, announce, parityEnabled = false }) {
  const [editing, setEditing] = useState(null)
  return <section><h2>Categorías</h2>
    {canEdit && <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget; run(async () => {
      const data = new FormData(form)
      await insert('categories', { institution_id: institution.id, name: String(data.get('name')).trim(), ...(parityEnabled ? { gender: data.get('gender') || null } : {}) })
      form.reset(); announce('Categoría creada.')
    }) }}><label>Nombre<input name="name" minLength="2" maxLength="80" required /></label>
      {parityEnabled && <label>Rama<select name="gender" defaultValue=""><option value="">Sin especificar</option><option value="female">Femenina</option><option value="male">Masculina</option></select></label>}
      <button disabled={busy}>Agregar categoría</button></form>}
    <ul>{categories.map(item => <li key={item.id}>
      <span>{item.name}{parityEnabled && ` · ${{ female:'Femenina', male:'Masculina' }[item.gender] || 'Rama sin especificar'} · ${item.active ? 'Activa' : 'Inactiva'}`}</span>
      {canEdit && <div><button disabled={busy} onClick={() => setEditing(editing === item.id ? null : item.id)}>{editing === item.id ? 'Cancelar' : 'Editar'}</button>
        <button type="button" disabled={busy} onClick={() => run(async () => {
          const removed = await deleteEmptyCategory({ client, institutionId: institution.id, category: item, confirm: text => window.confirm(text) })
          if (removed) { setEditing(null); announce('Categoría vacía eliminada.') }
        })}>Eliminar</button></div>}
      {editing === item.id && canEdit && <form className="inline-editor" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget), name = String(data.get('name')).trim(); run(async () => {
        const values = { name, ...(parityEnabled ? { gender: data.get('gender') || null, active: data.get('active') === 'on' } : {}) }
        const { error } = await client.from('categories').update(values).eq('institution_id', institution.id).eq('id', item.id).select('id').single()
        if (error) throw error
        setEditing(null); announce('Categoría actualizada.')
      }) }}><label>Nombre<input name="name" defaultValue={item.name} minLength="2" maxLength="80" required /></label>
        {parityEnabled && <><label>Rama<select name="gender" defaultValue={item.gender || ''}><option value="">Sin especificar</option><option value="female">Femenina</option><option value="male">Masculina</option></select></label><label><input type="checkbox" name="active" defaultChecked={item.active} /> Activa</label></>}
        <button disabled={busy}>Guardar cambios</button></form>}
    </li>)}</ul>
    {!categories.length && <p>Agregá una categoría para empezar a cargar jugadores y asistencia.</p>}
  </section>
}
