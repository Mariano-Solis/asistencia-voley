import React, { useState } from 'react'

export function CategoryManager({ client, institution, categories, canEdit, busy, run, insert, announce }) {
  const [editing, setEditing] = useState(null)
  return <section><h2>Categorías</h2>
    {canEdit && <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget; run(async () => {
      await insert('categories', { institution_id: institution.id, name: String(new FormData(form).get('name')).trim() })
      form.reset(); announce('Categoría creada.')
    }) }}><label>Nombre<input name="name" minLength="2" maxLength="80" required /></label><button disabled={busy}>Agregar categoría</button></form>}
    <ul>{categories.map(item => <li key={item.id}>
      <span>{item.name}</span>
      {canEdit && <button disabled={busy} onClick={() => setEditing(editing === item.id ? null : item.id)}>{editing === item.id ? 'Cancelar' : 'Editar'}</button>}
      {editing === item.id && canEdit && <form className="inline-editor" onSubmit={event => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get('name')).trim(); run(async () => {
        const { error } = await client.from('categories').update({ name }).eq('institution_id', institution.id).eq('id', item.id).select('id').single()
        if (error) throw error
        setEditing(null); announce('Categoría actualizada.')
      }) }}><label>Nombre<input name="name" defaultValue={item.name} minLength="2" maxLength="80" required /></label><button disabled={busy}>Guardar cambios</button></form>}
    </li>)}</ul>
    {!categories.length && <p>Agregá una categoría para empezar a cargar jugadores y asistencia.</p>}
  </section>
}
