import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import './pilot.css'

// Deliberately independent of src/supabase.js (San Martín redirects and auth overrides).
const url = import.meta.env.VITE_PILOT_SUPABASE_URL
const key = import.meta.env.VITE_PILOT_SUPABASE_ANON_KEY
const client = url && key && /^https:\/\//.test(url) ? createClient(url, key) : null
const emailOf = value => String(value || '').trim().toLowerCase()

function Pilot() {
  const [session, setSession] = useState(null)
  const [membership, setMembership] = useState(null)
  const [institution, setInstitution] = useState(null)
  const [isOwner, setIsOwner] = useState(false)
  const [ownerInstitutions, setOwnerInstitutions] = useState([])
  const [issuedCode, setIssuedCode] = useState('')
  const [categories, setCategories] = useState([])
  const [players, setPlayers] = useState([])
  const [sessions, setSessions] = useState([])
  const [attendance, setAttendance] = useState([])
  const [section, setSection] = useState('asistencia')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }))

  useEffect(() => {
    if (!client) return
    client.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, current) => setSession(current))
    return () => subscription.unsubscribe()
  }, [])
  useEffect(() => {
    setMembership(null); setInstitution(null); setIsOwner(false); setIssuedCode(''); setCategories([]); setPlayers([]); setSessions([]); setAttendance([])
    if (session) { refreshMembership().catch(showError); refreshOwner().catch(showError) }
  }, [session?.user?.id])
  useEffect(() => { if (institution) refreshData().catch(showError) }, [institution?.id])

  const showError = error => setMessage(error?.message || 'No se pudo completar la operación.')
  async function query(table, fields = '*', filters = []) {
    let request = client.from(table).select(fields)
    for (const [field, value] of filters) request = request.eq(field, value)
    const { data, error } = await request
    if (error) throw error
    return data
  }
  async function refreshMembership() {
    const memberships = await query('institution_memberships', 'institution_id,role,status')
    const first = memberships.find(m => m.status === 'active')
    if (!first) return
    const institutions = await query('institutions', '*', [['id', first.institution_id]])
    if (!institutions[0]) return
    setMembership(first); setInstitution(institutions[0])
  }
  async function refreshOwner() {
    const { data, error } = await client.rpc('pilot_is_owner')
    if (error) throw error
    setIsOwner(data === true)
    if (data === true) setOwnerInstitutions(await query('institutions'))
  }
  async function refreshData() {
    const id = institution.id
    const [cats, members, dates, marks] = await Promise.all([
      query('categories', '*', [['institution_id', id]]),
      query('players', '*', [['institution_id', id]]),
      query('training_sessions', '*', [['institution_id', id]]),
      query('attendance', '*', [['institution_id', id]])
    ])
    setCategories(cats); setPlayers(members); setSessions(dates); setAttendance(marks)
  }
  async function run(action) {
    setBusy(true); setMessage('')
    try { await action(); if (institution) await refreshData() }
    catch (error) { showError(error) }
    finally { setBusy(false) }
  }
  async function insert(table, values) {
    const { error } = await client.from(table).insert(values)
    if (error) throw error
  }
  async function auth(event, mode) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await run(async () => {
      const email = emailOf(data.get('email')), password = String(data.get('password'))
      if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.')
      const result = mode === 'signup'
        ? await client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + (import.meta.env.VITE_PILOT_BUILD === '1' ? '/' : '/pilot.html') } })
        : await client.auth.signInWithPassword({ email, password })
      if (result.error) throw result.error
      if (mode === 'signup') setMessage('Revisá tu correo y verificá la cuenta antes de iniciar sesión.')
    })
  }
  const currentSession = sessions.find(s => s.category_id === category && s.session_date === date)
  const listedPlayers = players.filter(p => p.category_id === category && p.active).sort((a,b) => a.full_name.localeCompare(b.full_name))
  const markFor = player => attendance.find(a => a.session_id === currentSession?.id && a.player_id === player.id)?.status
  async function setMark(player, status) {
    if (!currentSession) throw new Error('Primero creá la jornada.')
    const { error } = await client.from('attendance').upsert({ institution_id: institution.id, session_id: currentSession.id, player_id: player.id, status })
    if (error) throw error
  }

  if (!client) return <main><h1>Piloto Junín JNN</h1><p>Falta conectar una base de prueba separada. Configurá VITE_PILOT_SUPABASE_URL y VITE_PILOT_SUPABASE_ANON_KEY.</p></main>
  return <main>
    <header><div><small>PILOTO INSTITUCIONAL</small><h1>{institution?.name || 'Junín Vóley JNN'}</h1><p>Gestión de categorías, jugadores y asistencia</p></div>
      {session && <button onClick={() => client.auth.signOut()}>Cerrar sesión</button>}</header>
    {message && <p className="notice" role="status">{message}</p>}
    {!session ? <div className="grid">
      <form onSubmit={event => auth(event,'login')}><h2>Ingresar</h2><label>Correo<input name="email" type="email" required autoComplete="email"/></label><label>Contraseña<input name="password" type="password" required autoComplete="current-password"/></label><button disabled={busy}>Iniciar sesión</button></form>
      <form onSubmit={event => auth(event,'signup')}><h2>Crear cuenta</h2><p>Usá tu propio correo y contraseña. Confirmá el enlace recibido por correo.</p><label>Correo<input name="email" type="email" required autoComplete="email"/></label><label>Contraseña<input name="password" type="password" minLength="8" required autoComplete="new-password"/></label><button disabled={busy}>Registrarme</button></form>
    </div> : isOwner && !institution ? <section><h2>Propietario de plataforma</h2><p>El control de licencias y códigos se ejerce únicamente desde esta cuenta. El código aparecerá una sola vez: entregalo por un canal privado al correo designado.</p>{ownerInstitutions.map(item => <div key={item.id}><h3>{item.name}</h3><form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); run(async () => { const { error } = await client.rpc('pilot_set_license',{ p_institution: item.id,p_expires: new Date(data.get('expires')).toISOString(),p_active: true }); if (error) throw error; setMessage('Licencia activada.'); await refreshOwner() }) }}><label>Vigencia hasta<input name="expires" type="date" required/></label><button disabled={busy}>Activar o renovar licencia</button></form><button disabled={busy} onClick={() => run(async () => { const { error } = await client.rpc('pilot_set_license',{ p_institution: item.id,p_expires: null,p_active: false }); if (error) throw error; setMessage('Licencia suspendida.'); await refreshOwner() })}>Suspender licencia</button><form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); run(async () => { const { data: code,error } = await client.rpc('pilot_issue_code',{ p_institution: item.id,p_email: emailOf(data.get('email')) }); if (error) throw error; setIssuedCode(code) }) }}><label>Correo del administrador<input name="email" type="email" defaultValue={item.slug === 'jnn' ? 'juampy9977@gmail.com' : ''} required/></label><button disabled={busy}>Emitir código personal</button></form></div>)}{issuedCode && <p className="notice">Código emitido (se muestra solo ahora): <strong>{issuedCode}</strong></p>}</section>
    : !institution ? <section><h2>Activación institucional</h2><p>Tu cuenta todavía no tiene acceso. Si sos Juan Pablo, ingresá el código entregado directamente por el propietario de la plataforma. Los profesores deben esperar la habilitación de su administrador.</p><form onSubmit={event => { event.preventDefault(); const code = new FormData(event.currentTarget).get('code'); run(async () => { const { error } = await client.rpc('pilot_redeem_code', { p_code: String(code).trim() }); if (error) throw error; await refreshMembership() }) }}><label>Código de activación<input name="code" required autoComplete="off"/></label><button disabled={busy}>Canjear código</button></form></section>
    : <><nav>{[['asistencia','Asistencia'],['jugadores','Jugadores'],['categorias','Categorías'],['profesores','Profesores'],['identidad','Identidad']].map(([id,label]) => <button className={section === id ? 'selected' : ''} key={id} onClick={() => setSection(id)}>{label}</button>)}<button onClick={() => run(refreshData)} disabled={busy}>Actualizar</button></nav>
      <p>Institución: {institution.name} · Rol: {membership?.role === 'super_admin' ? 'Administrador' : 'Profesor'}</p>
      {section === 'categorias' && <section><h2>Categorías</h2>{membership?.role === 'super_admin' && <form onSubmit={event => { event.preventDefault(); const name = new FormData(event.currentTarget).get('name'); run(async () => { await insert('categories',{ institution_id: institution.id, name: String(name).trim() }); event.target.reset() }) }}><label>Nombre<input name="name" minLength="2" required/></label><button disabled={busy}>Agregar categoría</button></form>}<ul>{categories.map(c => <li key={c.id}>{c.name}</li>)}</ul></section>}
      {section === 'jugadores' && <section><h2>Jugadores</h2><form onSubmit={event => { event.preventDefault(); const form = event.currentTarget, data = new FormData(form); run(async () => { await insert('players',{ institution_id: institution.id, category_id: data.get('category'), full_name: String(data.get('name')).trim() }); form.reset() }) }}><label>Nombre completo<input name="name" minLength="2" required/></label><label>Categoría<select name="category" required defaultValue=""><option value="" disabled>Elegí una categoría</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button disabled={busy || !categories.length}>Agregar jugador</button></form><ul>{players.map(p => <li key={p.id}>{p.full_name} · {categories.find(c => c.id === p.category_id)?.name}</li>)}</ul></section>}
      {section === 'profesores' && <section><h2>Profesores</h2>{membership?.role === 'super_admin' ? <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget, email = new FormData(form).get('email'); run(async () => { const { error } = await client.rpc('pilot_add_professor',{ p_institution: institution.id, p_email: emailOf(email) }); if (error) throw error; setMessage('Profesor habilitado.'); form.reset() }) }}><p>El profesor debe registrarse y verificar su correo antes de habilitarlo.</p><label>Correo<input name="email" type="email" required/></label><button disabled={busy}>Habilitar profesor</button></form> : <p>Solo el administrador habilita profesores.</p>}</section>}
      {section === 'identidad' && <section><h2>Identidad institucional</h2><form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); run(async () => { const { error } = await client.rpc('pilot_update_brand',{ p_institution: institution.id,p_name: String(data.get('name')).trim(),p_color: data.get('color') }); if (error) throw error; setInstitution({ ...institution,name: String(data.get('name')).trim(),primary_color: data.get('color') }); setMessage('Identidad guardada.') }) }}><label>Nombre<input name="name" defaultValue={institution.name} minLength="2" required disabled={membership?.role !== 'super_admin'}/></label><label>Color principal<input name="color" type="color" defaultValue={institution.primary_color} disabled={membership?.role !== 'super_admin'}/></label>{membership?.role === 'super_admin' && <button disabled={busy}>Guardar</button>}</form></section>}
      {section === 'asistencia' && <section><h2>Asistencia</h2><label>Categoría<select value={category} onChange={event => setCategory(event.target.value)}><option value="">Elegí una categoría</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Fecha<input type="date" value={date} onChange={event => setDate(event.target.value)}/></label>{category && !currentSession && <button disabled={busy} onClick={() => run(() => insert('training_sessions',{ institution_id: institution.id, category_id: category, session_date: date }))}>Crear jornada</button>}{currentSession && <ul>{listedPlayers.map(p => <li key={p.id}><strong>{p.full_name}</strong><div>{[['present','Presente'],['late','Tarde'],['absent','Ausente']].map(([value,label]) => <button key={value} aria-pressed={markFor(p) === value} disabled={busy} onClick={() => run(() => setMark(p,value))}>{label}</button>)}</div></li>)}</ul>}</section>}
    </>}
    <footer>Versión piloto independiente · Los datos de San Martín no se utilizan aquí.</footer>
  </main>
}

createRoot(document.getElementById('pilot-root')).render(<Pilot />)
