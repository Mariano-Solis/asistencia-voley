import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabase'

const BASE_TABS = [
  'Asistencia',
  'Jugador@s',
  'Historial',
  'Horarios',
  'Profes',
  'Categorías',
  'Permisos',
  'Entrenamientos',
  'Pagos',
]

function cleanLabel(value = '') {
  return String(value)
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalLabel(value = '') {
  const text = cleanLabel(value).toLocaleLowerCase('es-AR')
  const known = BASE_TABS.find((item) => item.toLocaleLowerCase('es-AR') === text)
  if (known) return known

  if (text.includes('asistencia')) return 'Asistencia'
  if (text.includes('jugador')) return 'Jugador@s'
  if (text.includes('historial')) return 'Historial'
  if (text.includes('horario')) return 'Horarios'
  if (text.includes('profe')) return 'Profes'
  if (text.includes('categor')) return 'Categorías'
  if (text.includes('permiso')) return 'Permisos'
  if (text.includes('entrenamiento')) return 'Entrenamientos'
  if (text.includes('pago') || text.includes('cuota')) return 'Pagos'

  return cleanLabel(value)
}

function getNavigationButtons() {
  return Array.from(
    document.querySelectorAll(
      'main.app > nav button, main.app nav button, .player-section-nav button'
    )
  )
}

export default function FeatureTabManager() {
  const [disabledTabs, setDisabledTabs] = useState([])
  const [draft, setDraft] = useState([])
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [adminName, setAdminName] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [discovered, setDiscovered] = useState([])
  const [headerTarget, setHeaderTarget] = useState(null)
  const [brandTarget, setBrandTarget] = useState(null)
  const scheduledApply = useRef(0)

  useEffect(() => {
    let mounted = true

    async function load() {
      const [{ data: settings }, { data: sessionData }] = await Promise.all([
        supabase.from('app_ui_settings').select('disabled_tabs').eq('id', 'global').maybeSingle(),
        supabase.auth.getSession(),
      ])

      if (!mounted) return
      const hidden = Array.isArray(settings?.disabled_tabs) ? settings.disabled_tabs : []
      setDisabledTabs(hidden)
      setDraft(hidden)

      const userId = sessionData?.session?.user?.id
      if (!userId) {
        setIsSuperAdmin(false)
        setAdminName('')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role,full_name')
        .eq('id', userId)
        .maybeSingle()

      if (!mounted) return
      setIsSuperAdmin(profile?.role === 'super_admin')
      setAdminName(profile?.full_name || '')
    }

    load()
    const { data } = supabase.auth.onAuthStateChange(() => {
      setTimeout(load, 0)
    })

    return () => {
      mounted = false
      data?.subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isSuperAdmin) {
      setHeaderTarget(null)
      setBrandTarget(null)
      return
    }

    let cancelled = false
    let attempts = 0
    let timer = 0

    const findTargets = () => {
      if (cancelled) return
      attempts += 1

      const header = document.querySelector('main.app .topbar .top-user')
      const brand = document.querySelector('main.app .topbar .brand > div')

      if (header) setHeaderTarget(header)
      if (brand) setBrandTarget(brand)

      if (header && brand) return

      if (attempts < 40) {
        timer = window.setTimeout(findTargets, 200)
      }
    }

    findTargets()

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [isSuperAdmin])

  useEffect(() => {
    const apply = () => {
      scheduledApply.current = 0
      const buttons = getNavigationButtons()
      const found = new Set()

      buttons.forEach((button) => {
        const label = canonicalLabel(button.textContent)
        if (!label) return
        found.add(label)

        // La configuración guardada controla lo que ven los PROFES.
        // El Super Admin siempre conserva acceso visual a todas las solapas.
        const hidden = !isSuperAdmin && disabledTabs.includes(label)

        button.hidden = hidden
        button.setAttribute('aria-hidden', hidden ? 'true' : 'false')
        button.dataset.featureTab = label

        // Algunos estilos de navegación pueden sobreescribir el atributo hidden.
        // Forzamos display:none para que una solapa deshabilitada no quede visible ni clickeable.
        if (hidden) {
          button.style.setProperty('display', 'none', 'important')
        } else {
          button.style.removeProperty('display')
        }
      })

      const values = [...found]
      setDiscovered((previous) => {
        const same = previous.length === values.length && previous.every((item) => values.includes(item))
        return same ? previous : values
      })

      document.querySelectorAll('main.app > nav, main.app nav, .player-section-nav').forEach((nav) => {
        const active = nav.querySelector('button.active')
        if (active?.hidden || active?.style?.display === 'none') {
          const firstEnabled = Array.from(nav.querySelectorAll('button')).find(
            (button) => !button.hidden && button.style.display !== 'none'
          )
          if (firstEnabled) firstEnabled.click()
        }
      })
    }

    const scheduleApply = () => {
      if (scheduledApply.current) return
      scheduledApply.current = requestAnimationFrame(apply)
    }

    apply()
    const observer = new MutationObserver(scheduleApply)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      if (scheduledApply.current) cancelAnimationFrame(scheduledApply.current)
      scheduledApply.current = 0
    }
  }, [disabledTabs, isSuperAdmin])

  const tabs = useMemo(() => {
    const set = new Set([...BASE_TABS, ...discovered])
    return [...set].filter(Boolean)
  }, [discovered])

  function toggle(label) {
    setDraft((current) =>
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label]
    )
  }

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData?.session?.user?.id || null
      const { error } = await supabase
        .from('app_ui_settings')
        .update({
          disabled_tabs: draft,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        })
        .eq('id', 'global')

      if (error) throw error
      setDisabledTabs(draft)
      setMessage('✓ Solapas actualizadas para los profes.')
      setTimeout(() => window.location.reload(), 500)
    } catch (error) {
      setMessage(error?.message || 'No se pudieron guardar las solapas.')
    } finally {
      setSaving(false)
    }
  }

  if (!isSuperAdmin) return null

  const openButton = (
    <button
      type="button"
      className="mgsm-solapas-header-button"
      onClick={() => {
        setDraft(disabledTabs)
        setMessage('')
        setOpen(true)
      }}
      aria-label="Configurar solapas"
      title="Configurar solapas"
    >
      <span aria-hidden="true">⚙️</span>
      <span>Solapas</span>
    </button>
  )

  const adminNameNode = adminName ? (
    <span className="mgsm-admin-name-brand">{adminName}</span>
  ) : null

  return (
    <>
      <style>{`
        ${brandTarget ? `main.app .topbar .top-user > span:not(.role):not([data-admin-player-switch-host]) {
          display: none !important;
        }` : ''}

        .mgsm-admin-name-brand {
          display: block;
          margin-top: 2px;
          color: rgba(255,255,255,.96);
          font-size: 12px;
          font-weight: 800;
          line-height: 1.15;
          white-space: nowrap;
        }

        .mgsm-solapas-header-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          min-height: 40px;
          padding: 8px 11px;
          border: 1px solid rgba(255,255,255,.72);
          border-radius: 12px;
          background: rgba(255,255,255,.16);
          color: #fff;
          font: inherit;
          font-size: 12px;
          font-weight: 800;
          line-height: 1;
          white-space: nowrap;
          box-shadow: none;
          cursor: pointer;
          flex: 0 0 auto;
          order: 20;
        }

        main.app .topbar .top-user > .role {
          order: 10;
        }

        main.app .topbar .top-user > button:not(.mgsm-solapas-header-button) {
          order: 30;
        }

        .mgsm-solapas-header-button:hover,
        .mgsm-solapas-header-button:focus-visible {
          background: rgba(255,255,255,.28);
          outline: 2px solid rgba(255,255,255,.85);
          outline-offset: 2px;
        }

        @media (max-width: 760px) {
          main.app .topbar {
            gap: 8px !important;
          }

          main.app .topbar .brand {
            min-width: 0;
            flex: 1 1 auto;
          }

          .mgsm-admin-name-brand {
            font-size: 10px;
            max-width: 205px;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          main.app .topbar .top-user {
            gap: 6px !important;
            flex: 0 0 auto;
          }

          main.app .topbar .top-user .role {
            display: none !important;
          }

          .mgsm-solapas-header-button {
            min-height: 38px;
            padding: 7px 9px;
            border-radius: 10px;
            font-size: 11px;
            gap: 3px;
          }
        }
      `}</style>

      {headerTarget ? createPortal(openButton, headerTarget) : null}
      {brandTarget && adminNameNode ? createPortal(adminNameNode, brandTarget) : null}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Configurar solapas"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            background: 'rgba(0,0,0,.62)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
          }}
        >
          <section
            style={{
              width: 'min(520px, 100%)',
              maxHeight: '88vh',
              overflowY: 'auto',
              background: '#fff',
              borderRadius: 20,
              padding: 24,
              boxShadow: '0 20px 60px rgba(0,0,0,.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ color: '#1769e0', fontWeight: 800, fontSize: 13 }}>SUPER ADMIN</div>
                <h2 style={{ margin: '4px 0 0', color: '#17253a' }}>Solapas visibles para los profes</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                style={{ border: 0, background: 'none', fontSize: 30, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <p style={{ color: '#64748b', lineHeight: 1.5 }}>
              Tildada = aparece para los profes. Destildada = no aparece para los profes. Como Super Admin, vos siempre ves todas las solapas.
            </p>

            <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
              {tabs.map((label) => {
                const enabled = !draft.includes(label)
                return (
                  <label
                    key={label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      border: '1px solid #d9e2ee',
                      borderRadius: 12,
                      cursor: 'pointer',
                      fontWeight: 700,
                      color: '#17253a',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggle(label)}
                      style={{ width: 22, height: 22, flex: '0 0 auto' }}
                    />
                    <span>{label}</span>
                    <span style={{ marginLeft: 'auto', color: enabled ? '#178a5b' : '#b42318', fontSize: 13 }}>
                      {enabled ? 'PROFES: VISIBLE' : 'PROFES: OCULTA'}
                    </span>
                  </label>
                )
              })}
            </div>

            {message && (
              <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#f4f7fb' }}>{message}</div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={save}
                style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: 0, background: '#1769e0', color: '#fff', fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
