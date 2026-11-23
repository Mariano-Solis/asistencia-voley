import { exportCategoryWorkbook } from '../xlsxCategoryExport.js'

const branch = value => value === 'female' ? 'Femenino' : value === 'male' ? 'Masculino' : 'Sin rama definida'

export function categorySummaryPayload({ institution, categories, players, categoryIds = null, now = new Date() }) {
  const allowed = categoryIds ? new Set(categoryIds) : null
  const visibleCategories = categories.filter(category => !allowed || allowed.has(category.id))
  const ids = new Set(visibleCategories.map(category => category.id))
  const included = players.filter(player => ids.has(player.category_id))
  const categoryById = new Map(visibleCategories.map(category => [category.id,category]))
  const counts = new Map(visibleCategories.map(category => [category.id,0]))
  let female = 0, male = 0
  for (const player of included) {
    counts.set(player.category_id,counts.get(player.category_id) + 1)
    const gender = player.sex || categoryById.get(player.category_id)?.gender
    if (gender === 'female') female++
    if (gender === 'male') male++
  }
  const label = String(institution.name || 'Institución').trim()
  const slug = label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60) || 'institucion'
  return {
    appName:label,
    publisher:label,
    title:'Resumen de jugadores por categoría',
    exportDate:now.toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'}),
    selectionText:`${allowed ? 'Categorías seleccionadas' : 'Todas las categorías visibles'} · jugadores según filtros activos`,
    total:included.length,
    female,male,
    categoryRows:visibleCategories.map(category => [branch(category.gender),category.name,counts.get(category.id)]),
    includePlayerDetails:false,
    filename:`resumen-jugadores-${slug}-${now.toISOString().slice(0,10)}.xlsx`,
  }
}

export function downloadCategorySummary(args) {
  exportCategoryWorkbook(categorySummaryPayload(args))
}
