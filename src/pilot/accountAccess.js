export function usableAccountStatus(statuses, now = Date.now()) {
  return (statuses || []).find(status => status.membership_status === 'active'
    && status.institution_status === 'active'
    && status.license_status === 'active'
    && status.expires_at && new Date(status.expires_at).getTime() > now) || null
}

// A status RPC alone does not authorize an old institution still cached in the
// browser. Require a matching, visible membership after every refresh.
export function matchingActiveMembership(status, memberships) {
  if (!status) return null
  return (memberships || []).find(m => m.status === 'active'
    && m.institution_id === status.institution_id && m.role === status.role) || null
}
