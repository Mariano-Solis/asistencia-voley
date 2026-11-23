import React from 'react'

export function ProfessorCategoryPermissions({ client, institutionId, professors, categories, permissions, busy, run, announce }) {
  function change(professor, category, key, checked) {
    const current = permissions.find(row => row.user_id === professor.user_id && row.category_id === category.id)
    const next = {
      can_view: Boolean(current?.can_view), can_edit: Boolean(current?.can_edit),
      can_attendance: Boolean(current?.can_attendance), [key]: checked
    }
    if (key === 'can_edit' && checked) next.can_view = true
    if (key === 'can_view' && !checked) next.can_edit = false
    run(async () => {
      const { error } = await client.rpc('pilot_set_professor_category_permission', {
        p_institution:institutionId,p_user:professor.user_id,p_category:category.id,
        p_view:next.can_view,p_edit:next.can_edit,p_attendance:next.can_attendance
      })
      if (error) throw error
      announce(`Permisos de ${category.name} guardados.`)
    })
  }
  return <div><h3>Permisos por categoría</h3><p>Ver permite consultar nombres; editar permite gestionar jugadores; asistencia habilita jornadas y marcas. Los datos personales y fotos siguen reservados al administrador.</p>
    {professors.filter(p => p.status === 'active').map(professor => <div key={professor.user_id} className="professor-scope">
      <strong>{professor.email}</strong>
      {categories.map(category => {
        const row = permissions.find(p => p.user_id === professor.user_id && p.category_id === category.id)
        return <fieldset key={category.id}><legend>{category.name}</legend>
          {[["can_view","Ver"],["can_edit","Editar jugadores"],["can_attendance","Tomar asistencia"]].map(([key,label]) =>
            <label key={key}><input type="checkbox" checked={Boolean(row?.[key])} disabled={busy} onChange={event => change(professor,category,key,event.target.checked)} />{label}</label>)}</fieldset>
      })}
    </div>)}
  </div>
}
