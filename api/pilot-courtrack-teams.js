// A bounded, read-only discovery index from FMV standings already used by this repository.
// Team codes in standings are not global institutional IDs.
const competitions = [
  [893,3636],[894,3637],[895,3638],[896,3639],[897,3640],[898,3641],
  [899,3642],[900,3643],[901,3644],[913,3692],[915,3694],[886,3626],[888,3628],
]
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
const validLogo = value => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'cdn.courtrack.com' && url.pathname.includes('/Courtrack/App/FMV/Logos/') ? url.href : null
  } catch { return null }
}

export async function findTeams(query, fetcher = fetch) {
  const needle = normalize(query)
  if (needle.length < 2 || needle.length > 80) return []
  const responses = await Promise.allSettled(competitions.map(async ([tournament, stage]) => {
    const response = await fetcher(`https://api.courtrack.com/api/torneo/getPosiciones?id_torneos=${tournament}&id_etapas=${stage}`, { headers: { Accept:'application/json' }, signal:AbortSignal.timeout(7000) })
    if (!response.ok) throw new Error('Court Track unavailable')
    const payload = await response.json()
    return (payload.data || []).flatMap(table => (table.posicionesObj || []).map(row => ({
      code:String(row.id_equipo || '').trim(), logo:validLogo(row.logo), tournament, stage,
    })))
  }))
  const matches = responses.filter(result => result.status === 'fulfilled').flatMap(result => result.value)
    .filter(item => item.code && normalize(item.code).includes(needle))
  if (!responses.some(result => result.status === 'fulfilled')) throw new Error('Court Track no respondió. Se conserva la identidad actual.')
  return [...new Map(matches.map(item => [`${normalize(item.code)}:${item.logo || ''}`, item])).values()].slice(0,30)
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control','private, max-age=300')
  res.setHeader('Content-Type','application/json; charset=utf-8')
  if (req.method !== 'GET') return res.status(405).end(JSON.stringify({ error:'Método no permitido.' }))
  const q = String(req.query?.q || '')
  if (q.length < 2 || q.length > 80) return res.status(400).end(JSON.stringify({ error:'Escribí entre 2 y 80 caracteres.' }))
  try { return res.status(200).end(JSON.stringify({ source:'Court Track · tablas FMV', teams:await findTeams(q) })) }
  catch { return res.status(502).end(JSON.stringify({ error:'Court Track no respondió. Se conserva la identidad actual.' })) }
}
