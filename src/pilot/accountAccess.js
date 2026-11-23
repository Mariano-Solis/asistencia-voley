export function usableAccountStatus(statuses, now = Date.now()) {
  return (statuses || []).find(status => status.membership_status === 'active'
    && status.institution_status === 'active'
    && status.license_status === 'active'
    && status.expires_at && new Date(status.expires_at).getTime() > now) || null
}
