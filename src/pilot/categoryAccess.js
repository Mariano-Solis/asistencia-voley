export function categoryPermission(role, scopes = [], action, categoryId = '') {
  if (role === 'super_admin') return true
  if (role !== 'professor') return false
  const field = action === 'attendance' ? 'can_attendance' : action === 'edit' ? 'can_edit' : ''
  return !!field && scopes.some(scope => (!categoryId || scope.category_id === categoryId) && scope[field] === true)
}
