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
  const [checking, setChecking] = useState(true)
  const [contextLoading, setContextLoading] = useState(false)
  const [recovery, setRecovery] = useState(false)
  const [accountStatus, setAccountStatus] = useState(null)
  const [membership, setMembership] = useState(null)
  const [institution, setInstitution] = useState(null)
  const [isOwner, setIsOwner] = useState(false)
  const [ownerInstitutions, setOwnerInstitutions] = useState([])
  const [ownerLicenses, setOwnerLicenses] = useState([])
  const [ownerEvents, setOwnerEvents] = useState({})
  const [issuedCode, setIssuedCode] = useState('')
  const [categories, setCategories] = useState([])
  const [players, setPlayers] = useState([])
  const [professors, setProfessors] = useState([])
  const [sessions, setSessions] = useState([])
  const [attendance, setAttendance] = useState([])
  const [section, setSection] = useState('asistencia')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }))

  useEffect(() => {
    if (!client) return
    let active = true
    client.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) showError(error)
      setSession(data?.session || null)
      setChecking(false)
    })
    const { data: { subscription } } = client.auth.onAuthStateChange((event, current) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(current)
      setChecking(false)
    })
    const onFocus = () => { if (active) client.auth.getSession().then(({ data }) => { if (data?.session) refreshMembership().catch(showError) }) }
    window.addEventListener('focus', onFocus)
    return () => { active = false; subscription.unsubscribe(); window.removeEventListener('focus', onFocus) }
  }, [])
  useEffect(() => {
    setMembership(null); setInstitution(null); setAccountStatus(null); setIsOwner(false); setIssuedCode(''); setCategories([]); setPlayers([]); setProfessors([]); setSessions([]); setAttendance([])
    if (session) {
      setContextLoading(true)
      Promise.allSettled([refreshMembership(),refreshOwner()]).then(results => {
        for (const result of results) if (result.status === 'rejected') showError(result.reason)
        setContextLoading(false)
      })
    } else setContextLoading(false)
  }, [session?.access_token])
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
    const { data: userData, error: userError } = await client.auth.getUser()
    if (userError || !userData?.user) { await client.auth.signOut(); return }
    const { data: statuses, error: statusError } = await client.rpc('pilot_account_status')
    if (statusError) throw statusError
    const status = statuses?.[0] || null
    setAccountStatus(status)
    if (status && (status.membership_status !== 'active' || status.institution_status !== 'active' || status.license_status !== 'active' || !status.expires_at || new Date(status.expires_at) <= new Date())) {
      setMembership(null); setInstitution(null); return
    }
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
    if (data === true) {
      const [institutions, licenses] = await Promise.all([query('institutions'),query('institution_licenses')])
      setOwnerInstitutions(institutions); setOwnerLicenses(licenses)
      const events = await Promise.all(institutions.map(async institution => {
        const { data: rows, error: auditError } = await client.rpc('pilot_owner_events',{ p_institution:institution.id,p_limit:20 })
        if (auditError) throw auditError
        return [institution.id, rows]
      }))
      setOwnerEvents(Object.fromEntries(events))
    }
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
    if (membership?.role === 'super_admin') {
      const { data, error } = await client.rpc('pilot_list_professors',{ p_institution: id })
      if (error) throw error
      setProfessors(data)
    }
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
      if (['signup','login'].includes(mode) && password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.')
      const redirectTo = location.origin + (import.meta.env.VITE_PILOT_BUILD === '1' ? '/' : '/pilot.html')
      const result = mode === 'magic'
        ? await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true, data: { full_name: String(data.get('name') || '').trim() } } })
        : mode === 'recover'
        ? await client.auth.resetPasswordForEmail(email, { redirectTo })
        : mode === 'signup'
        ? await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
        : await client.auth.signInWithPassword({ email, password })
      if (result.error) throw result.error
      if (mode === 'signup') setMessage('Revisá tu correo y verificá la cuenta antes de iniciar sesión.')
      if (mode === 'magic') setMessage('Revisá tu correo y abrí el enlace para verificar la cuenta e ingresar. El enlace vence; no lo compartas.')
      if (mode === 'recover') setMessage('Si la cuenta existe, recibirás un enlace para recuperar el acceso.')
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
  function exportCsv() {
    const quote = value => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"','""')}"`
    const rows = [['Fecha','Categoría','Jugador','Estado'],...attendance.map(mark => {
      const day = sessions.find(item => item.id === mark.session_id)
      return [day?.session_date,categories.find(c => c.id === day?.category_id)?.name,players.find(p => p.id === mark.player_id)?.full_name,mark.status]
    })]
    const blob = new Blob(['\ufeff',rows.map(row => row.map(quote).join(';')).join('\r\n')],{ type:'text/csv;charset=utf-8' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob); anchor.download = `asistencia-${institution.name}-${date}.csv`; anchor.click()
    setTimeout(() => URL.revokeObjectURL(anchor.href),60000)
  }

  if (!client) return <main><h1>Piloto Junín JNN</h1><p>Falta conectar una base de prueba separada. Configurá VITE_PILOT_SUPABASE_URL y VITE_PILOT_SUPABASE_ANON_KEY.</p></main>
  return <main>
    <header style={{ background:institution?.primary_color || '#194b77' }}><div><small>VÓLEY COMERCIAL · PILOTO JNN</small><h1>{institution?.name || 'Una plataforma para tu club'}</h1><p>Gestión de categorías, jugadores y asistencia</p></div>
      {session && <button onClick={() => client.auth.signOut()}>Cerrar sesión</button>}</header>
    {message && <p className="notice" role="status">{message}</p>}
    {checking || contextLoading ? <section><p>Comprobando acceso y permisos…</p></section> : recovery ? <section className="auth-card"><h2>Elegí una contraseña nueva</h2><form onSubmit={event => { event.preventDefault(); const form = event.currentTarget, password = String(new FormData(form).get('password')); run(async () => { if (password.length < 8) throw new Error('Usá una contraseña de al menos 8 caracteres.'); const { error } = await client.auth.updateUser({ password }); if (error) throw error; setRecovery(false); form.reset(); setMessage('Contraseña actualizada.') }) }}><label>Nueva contraseña<input name="password" type="password" minLength="8" autoComplete="new-password" required /></label><button disabled={busy}>Guardar contraseña</button></form></section> : !session ? <div className="grid">
      <form onSubmit={event => auth(event,'login')}><h2>Ingresar</h2><label>Correo<input name="email" type="email" required autoComplete="email"/></label><label>Contraseña<input name="password" type="password" required autoComplete="current-password"/></label><button disabled={busy}>Iniciar sesión</button></form>
      <form onSubmit={event => auth(event,'signup')}><h2>Crear cuenta</h2><p>Usá tu propio correo y contraseña. Confirmá el enlace recibido por correo.</p><label>Correo<input name="email" type="email" required autoComplete="email"/></label><label>Contraseña<input name="password" type="password" minLength="8" required autoComplete="new-password"/></label><button disabled={busy}>Registrarme</button></form>
      <form onSubmit={event => auth(event,'magic')}><h2>Acceso por correo</h2><p>Recibí un enlace de un solo uso. Podés usarlo para crear una cuenta de prueba sin contraseña.</p><label>Nombre<input name="name" minLength="2" maxLength="100" autoComplete="name"/></label><label>Correo<input name="email" type="email" required autoComplete="email"/></label><button disabled={busy}>Enviar enlace de acceso</button></form>
      <form onSubmit={event => auth(event,'recover')}><h2>Recuperar acceso</h2><p>Te enviaremos un enlace si el correo está registrado.</p><label>Correo<input name="email" type="email" required autoComplete="email"/></label><button disabled={busy}>Enviar enlace</button></form>
    </div> : isOwner && !institution ? <section><h2>Propietario de plataforma</h2><p>El control de licencias y códigos se ejerce únicamente desde esta cuenta. El código aparecerá una sola vez: entregalo por un canal privado al correo designado.</p><form onSubmit={event => { event.preventDefault(); const form = event.currentTarget, data = new FormData(form); run(async () => { const { error } = await client.rpc('pilot_create_institution',{ p_slug:String(data.get('slug')).trim(),p_name:String(data.get('name')).trim() }); if (error) throw error; await refreshOwner(); form.reset(); setMessage('Institución creada en estado pendiente.') }) }}><h3>Agregar institución</h3><label>Identificador<input name="slug" pattern="[a-z0-9-]{2,40}" required placeholder="nuevo-club"/></label><label>Nombre<input name="name" minLength="2" maxLength="100" required/></label><button disabled={busy}>Crear institución pendiente</button></form>{ownerInstitutions.map(item => <div key={item.id}><h3>{item.name}</h3><p>Estado: {item.status} · Licencia: {ownerLicenses.find(l => l.institution_id === item.id)?.status || 'pendiente'} · Vigencia: {ownerLicenses.find(l => l.institution_id === item.id)?.expires_at ? new Date(ownerLicenses.find(l => l.institution_id === item.id).expires_at).toLocaleDateString('es-AR') : '—'}</p><form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); run(async () => { const { error } = await client.rpc('pilot_set_license',{ p_institution: item.id,p_expires: new Date(`${data.get('expires')}T23:59:59-03:00`).toISOString(),p_active: true }); if (error) throw error; setMessage('Licencia activada.'); await refreshOwner() }) }}><label>Vigencia hasta<input name="expires" type="date" required/></label><button disabled={busy}>Activar o renovar licencia</button></form><button disabled={busy || item.status !== 'active'} onClick={() => run(async () => { const { error } = await client.rpc('pilot_set_license',{ p_institution: item.id,p_expires: null,p_active: false }); if (error) throw error; setIssuedCode(''); setMessage('Licencia suspendida.'); await refreshOwner() })}>Suspender licencia</button><form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); run(async () => { const { data: code,error } = await client.rpc('pilot_issue_code',{ p_institution: item.id,p_email: emailOf(data.get('email')) }); if (error) throw error; setIssuedCode(code); await refreshOwner() }) }}><label>Correo del administrador<input name="email" type="email" required/></label><button disabled={busy || item.status !== 'active'}>Emitir código personal</button></form><details><summary>Historial de operaciones ({ownerEvents[item.id]?.length || 0})</summary><ul>{(ownerEvents[item.id] || []).map((event,index) => <li key={index}>{new Date(event.created_at).toLocaleString('es-AR')} · {event.event} · {event.actor_id?.slice(0,8) || 'sistema'}</li>)}</ul></details></div>)}{issuedCode && <p className="notice">Código emitido (se muestra solo ahora): <strong>{issuedCode}</strong> <button onClick={() => setIssuedCode('')}>Ocultar</button></p>}</section>
    : accountStatus && !institution ? <section className="auth-card"><h2>Acceso institucional no disponible</h2><p>{accountStatus.membership_status !== 'active' ? 'Tu membresía está suspendida.' : accountStatus.institution_status !== 'active' || accountStatus.license_status !== 'active' ? 'La licencia institucional está suspendida.' : 'La licencia institucional está vencida.'}</p><button onClick={() => run(refreshMembership)} disabled={busy}>Comprobar nuevamente</button></section>
    : !institution ? <section><h2>Activación institucional</h2><p>Tu cuenta todavía no tiene acceso. Si sos Juan Pablo, ingresá el código entregado directamente por el propietario de la plataforma. Los profesores deben esperar la habilitación de su administrador.</p><form onSubmit={event => { event.preventDefault(); const code = new FormData(event.currentTarget).get('code'); run(async () => { const { error } = await client.rpc('pilot_redeem_code', { p_code: String(code).trim() }); if (error) throw error; await refreshMembership() }) }}><label>Código de activación<input name="code" required autoComplete="off"/></label><button disabled={busy}>Canjear código</button></form></section>
    : <><nav aria-label="Secciones del club">{[['asistencia','Asistencia'],['jugadores','Jugadores'],['categorias','Categorías'],...(membership?.role === 'super_admin' ? [['profesores','Profesores']] : []),['historial','Historial'],['identidad','Identidad']].map(([id,label]) => <button className={section === id ? 'selected' : ''} aria-current={section === id ? 'page' : undefined} key={id} onClick={() => setSection(id)}>{label}</button>)}<button onClick={() => run(refreshData)} disabled={busy}>Actualizar</button></nav>
      <p>Institución: {institution.name} · Rol: {membership?.role === 'super_admin' ? 'Administrador' : 'Profesor'}</p>
      {section === 'categorias' && <section><h2>Categorías</h2>{membership?.role === 'super_admin' && <form onSubmit={event => { event.preventDefault(); const name = new FormData(event.currentTarget).get('name'); run(async () => { await insert('categories',{ institution_id: institution.id, name: String(name).trim() }); event.target.reset() }) }}><label>Nombre<input name="name" minLength="2" required/></label><button disabled={busy}>Agregar categoría</button></form>}<ul>{categories.map(c => <li key={c.id}>{c.name}</li>)}</ul></section>}
      {section === 'jugadores' && <section><h2>Jugadores</h2><form onSubmit={event => { event.preventDefault(); const form = event.currentTarget, data = new FormData(form); run(async () => { await insert('players',{ institution_id: institution.id, category_id: data.get('category'), full_name: String(data.get('name')).trim() }); form.reset() }) }}><label>Nombre completo<input name="name" minLength="2" required/></label><label>Categoría<select name="category" required defaultValue=""><option value="" disabled>Elegí una categoría</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button disabled={busy || !categories.length}>Agregar jugador</button></form><ul>{players.map(p => <li key={p.id}>{p.full_name} · {categories.find(c => c.id === p.category_id)?.name} · {p.active ? 'Activo' : 'Inactivo'} <button disabled={busy} onClick={() => run(async () => { const { error } = await client.from('players').update({ active: !p.active }).eq('institution_id',institution.id).eq('id',p.id); if (error) throw error })}>{p.active ? 'Desactivar' : 'Reactivar'}</button></li>)}</ul></section>}
      {section === 'profesores' && <section><h2>Profesores</h2>{membership?.role === 'super_admin' ? <><form onSubmit={event => { event.preventDefault(); const form = event.currentTarget, email = new FormData(form).get('email'); run(async () => { const { error } = await client.rpc('pilot_add_professor',{ p_institution: institution.id, p_email: emailOf(email) }); if (error) throw error; setMessage('Profesor habilitado.'); form.reset() }) }}><p>El profesor debe registrarse y verificar su correo antes de habilitarlo.</p><label>Correo<input name="email" type="email" required/></label><button disabled={busy}>Habilitar profesor</button></form><ul>{professors.map(p => <li key={p.user_id}>{p.email} · {p.status === 'active' ? 'Activo' : 'Suspendido'} <button disabled={busy} onClick={() => run(async () => { const { error } = await client.rpc('pilot_set_professor_status',{ p_institution: institution.id,p_user:p.user_id,p_active:p.status !== 'active' }); if (error) throw error })}>{p.status === 'active' ? 'Suspender' : 'Reactivar'}</button></li>)}</ul></> : <p>Solo el administrador habilita profesores.</p>}</section>}
      {section === 'identidad' && <section><h2>Identidad institucional</h2><form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); run(async () => { const { error } = await client.rpc('pilot_update_brand',{ p_institution: institution.id,p_name: String(data.get('name')).trim(),p_color: data.get('color') }); if (error) throw error; setInstitution({ ...institution,name: String(data.get('name')).trim(),primary_color: data.get('color') }); setMessage('Identidad guardada.') }) }}><label>Nombre<input name="name" defaultValue={institution.name} minLength="2" required disabled={membership?.role !== 'super_admin'}/></label><label>Color principal<input name="color" type="color" defaultValue={institution.primary_color} disabled={membership?.role !== 'super_admin'}/></label>{membership?.role === 'super_admin' && <button disabled={busy}>Guardar</button>}</form></section>}
      {section === 'historial' && <section><h2>Historial de asistencia</h2><button disabled={!attendance.length} onClick={exportCsv}>Exportar CSV</button><ul>{[...sessions].sort((a,b) => b.session_date.localeCompare(a.session_date)).map(day => <li key={day.id}>{day.session_date} · {categories.find(c => c.id === day.category_id)?.name} · {attendance.filter(a => a.session_id === day.id && a.status === 'present').length} presentes / {attendance.filter(a => a.session_id === day.id).length} registrados</li>)}</ul>{!sessions.length && <p>Aún no hay jornadas.</p>}</section>}
      {section === 'asistencia' && <section><h2>Asistencia</h2><label>Categoría<select value={category} onChange={event => setCategory(event.target.value)}><option value="">Elegí una categoría</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Fecha<input type="date" value={date} onChange={event => setDate(event.target.value)}/></label>{category && !currentSession && <button disabled={busy} onClick={() => run(() => insert('training_sessions',{ institution_id: institution.id, category_id: category, session_date: date }))}>Crear jornada</button>}{currentSession && <ul>{listedPlayers.map(p => <li key={p.id}><strong>{p.full_name}</strong><div>{[['present','Presente'],['late','Tarde'],['absent','Ausente']].map(([value,label]) => <button key={value} aria-pressed={markFor(p) === value} disabled={busy} onClick={() => run(() => setMark(p,value))}>{label}</button>)}</div></li>)}</ul>}</section>}
    </>}
    <footer>Versión piloto independiente · Los datos de San Martín no se utilizan aquí.</footer>
  </main>
}

createRoot(document.getElementById('pilot-root')).render(<Pilot />)
