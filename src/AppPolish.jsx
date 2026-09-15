import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabase'

const SIGNED_URL_TTL_SECONDS = 15 * 60
const SIGNED_URL_CACHE_MS = 13 * 60 * 1000
const selfieCache = new Map()

function extractSelfiePath(src = '') {
  try {
    const url = new URL(src, window.location.origin)
    const marker = '/player-selfies/'
    const index = url.pathname.indexOf(marker)
    if (index < 0) return ''
    return decodeURIComponent(url.pathname.slice(index + marker.length))
  } catch {
    return ''
  }
}

async function getSignedSelfieUrl(path) {
  const cached = selfieCache.get(path)
  if (cached && cached.expiresAt > Date.now()) return cached.url

  const { data, error } = await supabase.storage
    .from('player-selfies')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) return ''
  selfieCache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGNED_URL_CACHE_MS,
  })
  return data.signedUrl
}

function SecureSelfiePolish() {
  const processing = useRef(new Set())

  useEffect(() => {
    let cancelled = false
    let raf = 0

    async function upgradeImages() {
      raf = 0
      const { data: sessionData } = await supabase.auth.getSession()
      if (cancelled || !sessionData?.session) return

      const images = Array.from(
        document.querySelectorAll('img.avatar.photo[src*="/player-selfies/"]')
      )

      for (const image of images) {
        if (cancelled || image.dataset.privateSelfieReady === 'true') continue
        const path = extractSelfiePath(image.currentSrc || image.src)
        if (!path || processing.current.has(path)) continue

        processing.current.add(path)
        try {
          const signedUrl = await getSignedSelfieUrl(path)
          if (!cancelled && signedUrl && image.isConnected) {
            image.src = signedUrl
            image.dataset.privateSelfieReady = 'true'
            image.referrerPolicy = 'no-referrer'
          }
        } finally {
          processing.current.delete(path)
        }
      }
    }

    const schedule = () => {
      if (raf) return
      raf = window.requestAnimationFrame(upgradeImages)
    }

    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      cancelled = true
      observer.disconnect()
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [])

  return null
}

function OfflineNotice() {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  if (online) return null
  return (
    <div className="mgsm-offline-notice" role="status" aria-live="polite">
      <strong>Sin conexión</strong>
      <span>No cierres la app. Recuperá internet antes de guardar.</span>
    </div>
  )
}

function CoachAttendancePolish() {
  const [host, setHost] = useState(null)
  const [section, setSection] = useState(null)
  const [counts, setCounts] = useState({ present: 0, late: 0, absent: 0, pending: 0, total: 0 })
  const [dirty, setDirty] = useState(false)
  const [saveButton, setSaveButton] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const rafRef = useRef(0)

  const sync = useCallback(() => {
    rafRef.current = 0
    const currentSection = Array.from(document.querySelectorAll('main.app section')).find(
      (node) => node.querySelector('.page-title h1')?.textContent?.trim() === 'Asistencia'
    )

    if (!currentSection) {
      setSection(null)
      setHost(null)
      setSaveButton(null)
      return
    }

    const card = currentSection.querySelector('.attendance-card')
    if (!card) return

    let controlsHost = card.querySelector('[data-coach-attendance-polish]')
    if (!controlsHost) {
      controlsHost = document.createElement('div')
      controlsHost.setAttribute('data-coach-attendance-polish', 'true')
      const head = card.querySelector('.card-head')
      if (head) head.insertAdjacentElement('afterend', controlsHost)
      else card.prepend(controlsHost)
    }

    const rows = Array.from(card.querySelectorAll('.attendance-row'))
    let present = 0
    let late = 0
    let absent = 0
    let pending = 0

    rows.forEach((row) => {
      if (row.querySelector('.status.present.active')) present += 1
      else if (row.querySelector('.status.late.active')) late += 1
      else if (row.querySelector('.status.absent.active')) absent += 1
      else pending += 1
    })

    const originalSave = Array.from(card.querySelectorAll('button.primary.wide')).find(
      (button) => !button.closest('[data-coach-attendance-polish]')
    )

    const savedMessage = Array.from(card.querySelectorAll('.message')).some((message) =>
      message.textContent?.includes('Registro guardado')
    )
    if (savedMessage) setDirty(false)

    setSection(currentSection)
    setHost(controlsHost)
    setSaveButton(originalSave || null)
    setCounts({ present, late, absent, pending, total: rows.length })
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(async ({ data }) => {
      const userId = data?.session?.user?.id
      if (!userId || !mounted) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle()
      if (mounted) setIsAdmin(['admin', 'super_admin'].includes(profile?.role))
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const schedule = () => {
      if (rafRef.current) return
      rafRef.current = window.requestAnimationFrame(sync)
    }

    const onClick = (event) => {
      if (event.target.closest('main.app .attendance-card .status')) {
        setDirty(true)
        window.setTimeout(schedule, 0)
      }
    }

    schedule()
    document.addEventListener('click', onClick, true)
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      document.removeEventListener('click', onClick, true)
      observer.disconnect()
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
    }
  }, [sync])

  useEffect(() => {
    if (!dirty) return undefined
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (!isAdmin || !host || !section || !counts.total) return null

  const completePending = () => {
    const rows = Array.from(section.querySelectorAll('.attendance-row'))
    rows.forEach((row) => {
      if (!row.querySelector('.status.active')) {
        row.querySelector('.status.present')?.click()
      }
    })
    setDirty(true)
    window.setTimeout(sync, 0)
  }

  const save = () => {
    if (!saveButton || saveButton.disabled) return
    saveButton.click()
  }

  const controls = (
    <div className="mgsm-attendance-tools">
      <div className="mgsm-attendance-summary" aria-live="polite">
        <span className="present">✓ {counts.present} presentes</span>
        <span className="late">◷ {counts.late} tardanzas</span>
        <span className="absent">✕ {counts.absent} ausencias</span>
        <span className={counts.pending ? 'pending warn' : 'pending'}>
          {counts.pending ? `${counts.pending} pendientes` : 'Todo marcado'}
        </span>
      </div>
      <button
        type="button"
        className="mgsm-mark-pending"
        onClick={completePending}
        disabled={!counts.pending}
      >
        ✓ Completar pendientes como presentes
      </button>
      {dirty && <span className="mgsm-unsaved">● Cambios sin guardar</span>}
    </div>
  )

  return (
    <>
      {createPortal(controls, host)}
      <div className={`mgsm-attendance-savebar ${dirty ? 'is-dirty' : ''}`}>
        <div>
          <strong>{dirty ? 'Asistencia modificada' : 'Asistencia lista'}</strong>
          <span>{counts.total - counts.pending}/{counts.total} marcados</span>
        </div>
        <button type="button" onClick={save} disabled={!saveButton || saveButton.disabled}>
          {saveButton?.textContent?.includes('Guardando') ? 'Guardando…' : 'Guardar asistencia'}
        </button>
      </div>
    </>
  )
}

export default function AppPolish() {
  return (
    <>
      <SecureSelfiePolish />
      <OfflineNotice />
      <CoachAttendancePolish />
    </>
  )
}
