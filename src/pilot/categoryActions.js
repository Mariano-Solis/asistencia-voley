// The database FK and RLS remain the final authority. Counts make the
// destructive action understandable before asking for confirmation.
export async function deleteEmptyCategory({ client, institutionId, category, confirm }) {
  if (!institutionId || !category?.id) throw new Error('No se pudo identificar la categoría.')
  const [players, sessions] = await Promise.all([
    client.from('players').select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId).eq('category_id', category.id),
    client.from('training_sessions').select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId).eq('category_id', category.id)
  ])
  if (players.error || sessions.error || players.count == null || sessions.count == null) {
    throw players.error || sessions.error || new Error('No se pudo verificar si la categoría tiene registros.')
  }
  if (players.count || sessions.count) {
    throw new Error(`No se puede eliminar “${category.name}”: tiene ${players.count} jugadores y ${sessions.count} jornadas. Se conserva el historial.`)
  }
  if (!confirm(`¿Eliminar definitivamente la categoría vacía “${category.name}”? Esta acción no se puede deshacer.`)) return false
  const { data, error } = await client.from('categories').delete()
    .eq('institution_id', institutionId).eq('id', category.id).select('id').single()
  if (error) throw error
  if (data?.id !== category.id) throw new Error('No se pudo confirmar la eliminación de la categoría.')
  return true
}
