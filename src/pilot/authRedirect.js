// Supabase Auth's commercial allow list contains the protected branch alias,
// not every short-lived deployment URL. Email links must land on one stable
// origin so confirmation and recovery do not silently use the Site URL fallback.
export const PILOT_AUTH_ORIGIN = 'https://voley-comercial-junin-piloto-git-feature-voley-8add7d-miga-mia.vercel.app'

export function pilotAuthRedirect(origin, isolatedBuild) {
  return isolatedBuild ? `${PILOT_AUTH_ORIGIN}/` : `${origin}/pilot.html`
}
