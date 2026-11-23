// A successful write must not be reported as failed merely because the
// follow-up read lost connectivity. The caller can offer an explicit refresh.
export async function performClubAction(action, refresh) {
  await action()
  if (!refresh) return { refreshed: true }
  try {
    await refresh()
    return { refreshed: true }
  } catch (error) {
    return { refreshed: false, error }
  }
}
