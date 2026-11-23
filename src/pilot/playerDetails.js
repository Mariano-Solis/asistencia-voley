// Keep old full_name records readable without assigning invented personal data.
export function playerDetailsFromForm(form, categories) {
  const first_name = String(form.get('first_name') || '').trim()
  const last_name = String(form.get('last_name') || '').trim()
  const category_id = String(form.get('category') || '')
  const category = categories.find(item => item.id === category_id)
  const sex = String(form.get('sex') || '') || null
  const dni = String(form.get('dni') || '').trim() || null
  const birth_date = String(form.get('birth_date') || '') || null
  const team = String(form.get('team') || '').trim() || null
  if (!category) throw new Error('Seleccioná una categoría válida.')
  if (!first_name || !last_name || first_name.length > 80 || last_name.length > 80) throw new Error('Completá nombre y apellido (hasta 80 caracteres).')
  if (`${last_name} ${first_name}`.length > 120) throw new Error('El nombre completo no puede superar 120 caracteres.')
  if (category.gender && sex && category.gender !== sex) throw new Error('La rama del jugador no coincide con la categoría.')
  if (dni && !/^[0-9]{6,12}$/.test(dni)) throw new Error('El DNI debe contener entre 6 y 12 números.')
  if (birth_date && (birth_date > new Date().toISOString().slice(0, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(birth_date))) throw new Error('Ingresá una fecha de nacimiento válida.')
  if (team && team.length > 40) throw new Error('El equipo no puede superar 40 caracteres.')
  const automatic = suggestedCategory(categories, birth_date, sex)
  return { first_name, last_name, full_name: `${last_name.toLocaleUpperCase('es-AR')} ${first_name}`, category_id, sex, dni, birth_date, team,
    category_override: Boolean(birth_date && sex && automatic?.id !== category_id) }
}

export function suggestedCategory(categories, birthDate, sex, year = Number(new Intl.DateTimeFormat('en-US', { year:'numeric', timeZone:'America/Argentina/Mendoza' }).format(new Date()))) {
  if (!birthDate || !sex || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null
  const age = year - Number(birthDate.slice(0, 4))
  const name = sex === 'male' ? 'Primera' : age >= 30 ? 'Master A' : age <= 12 ? 'Sub 12' : age <= 14 ? 'Sub 14' : age <= 16 ? 'Sub 16' : age <= 18 ? 'Sub 18' : 'Primera'
  return categories.find(c => c.active && c.gender === sex && c.name.trim().toLocaleLowerCase('es-AR') === name.toLocaleLowerCase('es-AR')) || null
}
