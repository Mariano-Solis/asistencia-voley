// Shared with the original attendance analytics. Callers pass only rows already
// authorized and filtered for the current view.
export function attendanceStats(rows = []) {
  const valid = rows.filter(row => ['present','late','absent'].includes(row?.status))
  const total = valid.length
  const present = valid.filter(row => row.status === 'present').length
  const late = valid.filter(row => row.status === 'late').length
  const absent = valid.filter(row => row.status === 'absent').length
  const pct = value => total ? Math.round((value / total) * 1000) / 10 : 0
  return {
    total, present, late, absent,
    presentPct: pct(present), latePct: pct(late), absentPct: pct(absent),
  }
}
