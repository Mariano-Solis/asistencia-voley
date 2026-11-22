import React, { useState } from 'react'
import { logoPrimaryColor } from './colorFromLogo.js'

export function CourtTrackFinder({ institution, client, onSaved }) {
  const [query, setQuery] = useState('')
  const [teams, setTeams] = useState([])
  const [candidate, setCandidate] = useState(null)
  const [color, setColor] = useState('#194b77')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function search(event) {
    event.preventDefault(); setBusy(true); setMessage(''); setCandidate(null)
    try {
      const response = await fetch(`/api/pilot-courtrack-teams?q=${encodeURIComponent(query.trim())}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'No se pudo consultar Court Track.')
      setTeams(payload.teams || [])
      if (!payload.teams?.length) setMessage('No hay coincidencias en las tablas FMV disponibles. Se conserva la identidad actual.')
    } catch (error) { setTeams([]); setMessage(error.message) }
    finally { setBusy(false) }
  }
  async function select(team) {
    setCandidate(team); setMessage('')
    if (!team.logo) { setMessage('Este equipo no tiene escudo disponible en Court Track. No se asignará una imagen.'); return }
    try {
      const extracted = await logoPrimaryColor(team.logo)
      if (extracted) setColor(extracted)
      else setMessage('No se pudo extraer un color fiable. Elegí el color antes de confirmar.')
    } catch { setMessage('El escudo se ve, pero la fuente impide analizar sus píxeles. Elegí el color antes de confirmar.') }
  }
  async function save() {
    if (!candidate?.logo) return
    setBusy(true); setMessage('')
    try {
      const { error } = await client.rpc('pilot_set_courtrack_identity', {
        p_institution:institution.id,p_team_code:candidate.code,p_logo_url:candidate.logo,p_primary_color:color,
      })
      if (error) throw error
      await onSaved()
      setMessage('Escudo y color guardados. La asociación quedó registrada en el historial.')
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  return <div className="court-finder"><h4>Buscar en Court Track</h4>
    <p>Esta búsqueda usa códigos de equipos en tablas FMV; no es un catálogo oficial de instituciones ni informa la localidad. Confirmá visualmente el escudo antes de asociarlo.</p>
    <form onSubmit={search}><label>Código o parte del nombre del equipo<input value={query} onChange={event => setQuery(event.target.value)} minLength="2" maxLength="80" placeholder="JNN" required /></label><button disabled={busy}>Buscar equipos</button></form>
    {message && <p className="notice" role="status">{message}</p>}
    <ul>{teams.map(team => <li key={`${team.code}-${team.logo}`}><span>{team.logo && <img className="crest" src={team.logo} alt={`Escudo del equipo ${team.code} según Court Track`} loading="lazy" onError={event => { event.currentTarget.hidden = true }} />}{team.code} · torneo {team.tournament}</span><button disabled={busy || !team.logo} onClick={() => select(team)}>Revisar</button></li>)}</ul>
    {candidate?.logo && <div className="candidate"><p><strong>Asociar {candidate.code} a {institution.name}:</strong> corroborá que el escudo sea el correcto. La denominación institucional no se cambia automáticamente.</p>
      <img className="crest-large" src={candidate.logo} alt={`Escudo de ${candidate.code} en Court Track`} />
      <label>Color principal extraído o corregido<input type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
      <button disabled={busy} onClick={save}>Confirmar asociación y guardar</button>
    </div>}
  </div>
}
