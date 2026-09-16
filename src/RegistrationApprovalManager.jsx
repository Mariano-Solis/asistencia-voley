import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabase'

function formatDate(value) {
  if (!value) return '—'
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-AR')
}

function statusLabel(status) {
  if (status === 'rejected') return 'Rechazado'
  if (status === 'approved') return 'Aprobado'
  return 'Pendiente'
}

export default function RegistrationApprovalManager() {
  const [role, setRole] = useState('')
  const [navTarget, setNavTarget] = useState(null)
  const [host, setHost] = useState(null)
  const [open, setOpen] = useState(false)
  const [players, setPlayers] = useState([])
  const [professors, setProfessors] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')

  const isAdmin = role === 'admin' || role === 'super_admin'
  const pendingCount = useMemo(
    () => players.filter((item) => item.approval_status === 'pending').length + professors.filter((item) => item.approval_status === 'pending').length,
    [players, professors],
  )

  useEffect(() => {
    let alive = true
    async function resolveRole() {
      const { data } = await supabase.auth.getUser()
      const user = data?.user
      if (!alive || !user) {
        if (alive) setRole('')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role,active,approval_status')
        .eq('id', user.id)
        .maybeSingle()
      if (!alive) return
      if (profile?.active && profile?.approval_status === 'approved') setRole(profile.role || '')
      else setRole('')
    }
    resolveRole()
    const { data } = supabase.auth.onAuthStateChange(() => setTimeout(resolveRole, 0))
    return () => {
      alive = false
      data?.subscription?.unsubscribe()
    }
  }, [])

  async function loadRequests(showLoading = true) {
    if (!isAdmin) return
    if (showLoading) setLoading(true)
    setMessage('')
    try {
      const { data, error } = await supabase.rpc('get_registration_requests')
      if (error) throw error
      setPlayers(Array.isArray(data?.players) ? data.players : [])
      setProfessors(Array.isArray(data?.professors) ? data.professors : [])
    } catch (error) {
      setMessage(error?.message || 'No se pudieron cargar las solicitudes.')
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin) loadRequests(true)
    else {
      setPlayers([])
      setProfessors([])
      setOpen(false)
    }
  }, [isAdmin, role])

  useEffect(() => {
    if (!isAdmin) {
      setNavTarget(null)
      setHost(null)
      return undefined
    }
    let frame = 0
    let createdHost = null
    const sync = () => {
      frame = 0
      const nav = document.querySelector('main.app > nav, main.app nav')
      const content = document.querySelector('main.app .content-inner')
      setNavTarget((current) => (current === nav ? current : nav || null))
      if (!content) return
      let pageHost = content.querySelector(':scope > [data-registration-approval-host]')
      if (!pageHost) {
        pageHost = document.createElement('div')
        pageHost.setAttribute('data-registration-approval-host', 'true')
        content.appendChild(pageHost)
        createdHost = pageHost
      }
      setHost((current) => (current === pageHost ? current : pageHost))
    }
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(sync)
    }
    sync()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
      setNavTarget(null)
      setHost(null)
      if (createdHost?.isConnected) createdHost.remove()
    }
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return undefined
    const closeFromOtherTab = (event) => {
      const button = event.target?.closest?.('main.app > nav button, main.app nav button')
      if (!button || button.classList.contains('mgsm-approval-nav-tab')) return
      setOpen(false)
    }
    document.addEventListener('click', closeFromOtherTab, true)
    return () => document.removeEventListener('click', closeFromOtherTab, true)
  }, [isAdmin])

  useEffect(() => {
    const content = host?.parentElement
    const nav = document.querySelector('main.app > nav, main.app nav')
    const button = nav?.querySelector('.mgsm-approval-nav-tab')
    if (!content || !nav || !button) return undefined
    if (open) {
      content.dataset.approvalPageOpen = 'true'
      nav.dataset.approvalOpen = 'true'
      button.classList.add('active')
      button.setAttribute('aria-current', 'page')
    } else {
      delete content.dataset.approvalPageOpen
      delete nav.dataset.approvalOpen
      button.classList.remove('active')
      button.removeAttribute('aria-current')
    }
    return () => {
      delete content.dataset.approvalPageOpen
      delete nav.dataset.approvalOpen
      button.classList.remove('active')
      button.removeAttribute('aria-current')
    }
  }, [host, open])

  async function review(kind, id, decision) {
    const key = `${kind}:${id}`
    setBusy(key)
    setMessage('')
    try {
      const { data, error } = await supabase.rpc('review_registration', {
        p_target_id: id,
        p_kind: kind,
        p_decision: decision,
      })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.message || 'No se pudo resolver la solicitud.')
      setMessage(decision === 'approved' ? '✓ Solicitud aprobada.' : 'Solicitud rechazada.')
      await loadRequests(false)
    } catch (error) {
      setMessage(error?.message || 'No se pudo resolver la solicitud.')
    } finally {
      setBusy('')
    }
  }

  if (!isAdmin) return null

  const navButton = (
    <button
      type="button"
      className="mgsm-approval-nav-tab"
      data-feature-tab="Solicitudes"
      aria-label="Solicitudes de acceso"
      title="Solicitudes de acceso"
      onClick={() => {
        setOpen(true)
        loadRequests(false)
      }}
    >
      <span>Solicitudes{pendingCount ? ` (${pendingCount})` : ''}</span>
    </button>
  )

  const page = open && host ? createPortal(
    <section className="registration-approval-page">
      <header className="registration-approval-title">
        <div>
          <h1>Solicitudes de acceso</h1>
          <p>Aprobá únicamente personas que reconozcas como integrantes del vóley del Polideportivo.</p>
        </div>
        <button type="button" onClick={() => loadRequests(true)}>↻ Actualizar</button>
      </header>

      {message && <div className="registration-approval-message">{message}</div>}
      {loading ? <div className="registration-approval-empty">Cargando solicitudes...</div> : (
        <>
          {role === 'super_admin' && (
            <section className="registration-approval-section">
              <div className="registration-approval-section-head">
                <h2>👨‍🏫 Profes</h2>
                <span>Sólo el Super Admin puede aprobarlos</span>
              </div>
              {professors.length ? professors.map((item) => (
                <article className={`registration-request-card ${item.approval_status}`} key={item.id}>
                  <div className="registration-request-info">
                    <strong>{item.full_name || 'Sin nombre'}</strong>
                    <span>{item.email || 'Sin correo'}</span>
                    <small>{statusLabel(item.approval_status)} · Solicitud {formatDate(item.created_at?.slice?.(0, 10))}</small>
                  </div>
                  <div className="registration-request-actions">
                    <button className="approve" disabled={!!busy} onClick={() => review('professor', item.id, 'approved')}>✓ Aprobar Profe</button>
                    <button className="reject" disabled={!!busy} onClick={() => review('professor', item.id, 'rejected')}>✕ Rechazar</button>
                  </div>
                </article>
              )) : <div className="registration-approval-empty">No hay solicitudes de Profes pendientes.</div>}
            </section>
          )}

          <section className="registration-approval-section">
            <div className="registration-approval-section-head">
              <h2>🏐 Jugador@s</h2>
              <span>Profes autorizados y Super Admin pueden aprobar</span>
            </div>
            {players.length ? players.map((item) => (
              <article className={`registration-request-card ${item.approval_status}`} key={item.id}>
                <div className="registration-request-info">
                  <strong>{item.full_name || 'Sin nombre'}</strong>
                  <span>{item.sex === 'female' ? 'Femenino' : item.sex === 'male' ? 'Masculino' : 'Rama sin definir'} · {item.category_name || 'Sin categoría'}</span>
                  <small>Nacimiento: {formatDate(item.birth_date)} · {statusLabel(item.approval_status)}</small>
                </div>
                <div className="registration-request-actions">
                  <button className="approve" disabled={!!busy} onClick={() => review('player', item.id, 'approved')}>✓ Aprobar Jugador@</button>
                  <button className="reject" disabled={!!busy} onClick={() => review('player', item.id, 'rejected')}>✕ Rechazar</button>
                </div>
              </article>
            )) : <div className="registration-approval-empty">No hay solicitudes de Jugador@s pendientes.</div>}
          </section>
        </>
      )}
    </section>,
    host,
  ) : null

  return (
    <>
      {navTarget ? createPortal(navButton, navTarget) : null}
      {page}
    </>
  )
}
