import { useEffect } from 'react'
import { stageTurnstileToken } from './turnstileGuard'

const SITE_KEY = '0x4AAAAAAE5m8LMz_YlXvTxO'
const SCRIPT_ID = 'mgsm-turnstile-script'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)

  return new Promise((resolve, reject) => {
    let script = document.getElementById(SCRIPT_ID)
    if (!script) {
      script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = SCRIPT_SRC
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    const ready = () => {
      if (window.turnstile) resolve(window.turnstile)
      else reject(new Error('Turnstile no quedó disponible.'))
    }

    if (window.turnstile) {
      resolve(window.turnstile)
      return
    }

    script.addEventListener('load', ready, { once: true })
    script.addEventListener('error', () => reject(new Error('No se pudo cargar Turnstile.')), { once: true })
  })
}

function playerSignupForm() {
  const card = document.querySelector('.auth-card')
  if (!card) return null
  const activeTab = card.querySelector('.auth-tabs button.active')?.textContent?.trim()
  if (activeTab !== 'Crear cuenta') return null
  return card.querySelector('form')
}

function registrationForms() {
  return [playerSignupForm(), document.querySelector('.professor-signup-form')].filter(Boolean)
}

export default function RegistrationTurnstile() {
  useEffect(() => {
    let disposed = false
    let frame = 0
    const tokens = new WeakMap()
    const widgetIds = new WeakMap()

    const renderForm = async (form) => {
      if (!form || form.dataset.turnstileReady === 'true') return
      form.dataset.turnstileReady = 'loading'

      let turnstile
      try {
        turnstile = await loadTurnstile()
      } catch {
        form.dataset.turnstileReady = 'error'
        return
      }
      if (disposed || !form.isConnected) return

      let host = form.querySelector(':scope > .mgsm-turnstile-wrap')
      if (!host) {
        host = document.createElement('div')
        host.className = 'mgsm-turnstile-wrap'
        host.innerHTML = '<div class="mgsm-turnstile-title">Verificación de seguridad</div><div class="mgsm-turnstile-widget"></div><small>Esta verificación evita registros automáticos o masivos.</small>'
        const submit = form.querySelector('button[type="submit"], button.primary')
        if (submit) form.insertBefore(host, submit)
        else form.appendChild(host)
      }

      const mount = host.querySelector('.mgsm-turnstile-widget')
      if (!mount) return

      try {
        const widgetId = turnstile.render(mount, {
          sitekey: SITE_KEY,
          theme: 'auto',
          size: 'flexible',
          action: 'registration',
          callback: (token) => tokens.set(form, token),
          'expired-callback': () => tokens.delete(form),
          'timeout-callback': () => tokens.delete(form),
          'error-callback': () => tokens.delete(form),
        })
        widgetIds.set(form, widgetId)
        form.dataset.turnstileReady = 'true'
      } catch {
        form.dataset.turnstileReady = 'error'
      }
    }

    const sync = () => {
      frame = 0
      registrationForms().forEach(renderForm)
    }

    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(sync)
    }

    const handleSubmit = (event) => {
      const form = event.target
      if (!(form instanceof HTMLFormElement)) return
      if (!registrationForms().includes(form)) return
      stageTurnstileToken(tokens.get(form) || '', form)
    }

    const handleConsumed = (event) => {
      const form = event.detail?.form
      if (!form) return
      tokens.delete(form)
      const widgetId = widgetIds.get(form)
      if (widgetId !== undefined && window.turnstile) {
        try { window.turnstile.reset(widgetId) } catch (_) {}
      }
    }

    sync()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    document.addEventListener('submit', handleSubmit, true)
    window.addEventListener('mgsm:turnstile-consumed', handleConsumed)

    return () => {
      disposed = true
      observer.disconnect()
      document.removeEventListener('submit', handleSubmit, true)
      window.removeEventListener('mgsm:turnstile-consumed', handleConsumed)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return null
}
