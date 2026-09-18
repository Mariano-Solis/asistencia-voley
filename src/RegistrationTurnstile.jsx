import { useEffect } from 'react'
import { stageTurnstileToken } from './turnstileGuard'

const SITE_KEY = '0x4AAAAAAE5m8LMz_YlXvTxO'
const SCRIPT_ID = 'mgsm-turnstile-script'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

function ensureHost(form) {
  const slot = form.querySelector('[data-turnstile-slot]')
  let host = slot?.querySelector(':scope > .mgsm-turnstile-wrap') || form.querySelector(':scope > .mgsm-turnstile-wrap')
  if (!host) {
    host = document.createElement('div')
    host.className = 'mgsm-turnstile-wrap'
    host.innerHTML = '<div class="mgsm-turnstile-title">Verificación De Seguridad</div><div class="mgsm-turnstile-status">Cargando Verificación...</div><div class="mgsm-turnstile-widget"></div><button type="button" class="mgsm-turnstile-retry" hidden>Reintentar Verificación</button><small>Esta Verificación Evita Registros Automáticos O Masivos.</small>'
    if (slot) slot.appendChild(host)
    else {
      const submit = form.querySelector('button[type="submit"], button.primary')
      if (submit) form.insertBefore(host, submit)
      else form.appendChild(host)
    }
  } else if (slot && host.parentElement !== slot) {
    slot.appendChild(host)
  }
  return host
}

function loadTurnstile({ forceReload = false } = {}) {
  if (window.turnstile) return Promise.resolve(window.turnstile)

  return new Promise((resolve, reject) => {
    let script = document.getElementById(SCRIPT_ID)
    if (forceReload && script) {
      script.remove()
      script = null
    }
    if (!script) {
      script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = SCRIPT_SRC
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    let settled = false
    const finish = (error = null) => {
      if (settled) return
      settled = true
      window.clearInterval(timer)
      window.clearTimeout(timeout)
      script?.removeEventListener('error', onError)
      if (error) reject(error)
      else resolve(window.turnstile)
    }
    const onError = () => {
      script?.remove()
      finish(new Error('No Se Pudo Cargar La Verificación De Seguridad.'))
    }
    script.addEventListener('error', onError, { once: true })

    const timer = window.setInterval(() => {
      if (window.turnstile) finish()
    }, 120)
    const timeout = window.setTimeout(() => {
      if (!window.turnstile) {
        script?.remove()
        finish(new Error('La Verificación De Seguridad Tardó Demasiado En Cargar.'))
      }
    }, 10000)

    if (window.turnstile) finish()
  })
}

function playerSignupForm() {
  const card = document.querySelector('.auth-card')
  if (!card) return null
  const activeTab = card.querySelector('.auth-tabs button.active')?.textContent?.trim()
  if (activeTab !== 'Crear Cuenta') return null
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
    const rendering = new WeakSet()

    const renderForm = async (form, forceReload = false) => {
      if (!form || rendering.has(form)) return
      const host = ensureHost(form)
      const status = host.querySelector('.mgsm-turnstile-status')
      const retry = host.querySelector('.mgsm-turnstile-retry')
      const mount = host.querySelector('.mgsm-turnstile-widget')
      if (!mount) return

      if (form.dataset.turnstileReady === 'true' && !forceReload) return
      rendering.add(form)
      form.dataset.turnstileReady = 'loading'
      form.dataset.turnstileVerified = 'false'
      if (status) status.textContent = 'Cargando Verificación...'
      if (retry) retry.hidden = true

      try {
        const turnstile = await loadTurnstile({ forceReload })
        if (disposed || !form.isConnected) return

        const oldWidget = widgetIds.get(form)
        if (oldWidget !== undefined) {
          try { turnstile.remove(oldWidget) } catch (_) {}
          widgetIds.delete(form)
        }
        mount.innerHTML = ''

        const widgetId = turnstile.render(mount, {
          sitekey: SITE_KEY,
          theme: 'auto',
          size: 'flexible',
          action: 'registration',
          callback: (token) => {
            tokens.set(form, token)
            form.dataset.turnstileVerified = 'true'
            if (status) status.textContent = '✓ Verificación Completada.'
          },
          'expired-callback': () => {
            tokens.delete(form)
            form.dataset.turnstileVerified = 'false'
            if (status) status.textContent = 'La Verificación Venció. Completala Nuevamente.'
          },
          'timeout-callback': () => {
            tokens.delete(form)
            form.dataset.turnstileVerified = 'false'
            if (status) status.textContent = 'La Verificación Tardó Demasiado. Reintentá.'
          },
          'error-callback': () => {
            tokens.delete(form)
            form.dataset.turnstileVerified = 'false'
            if (status) status.textContent = 'No Se Pudo Completar La Verificación. Reintentá.'
            if (retry) retry.hidden = false
          },
        })
        widgetIds.set(form, widgetId)
        form.dataset.turnstileReady = 'true'
      } catch (error) {
        form.dataset.turnstileReady = 'error'
        if (status) status.textContent = error?.message || 'No Se Pudo Cargar La Verificación De Seguridad.'
        if (retry) retry.hidden = false
      } finally {
        rendering.delete(form)
      }

      if (retry && retry.dataset.bound !== 'true') {
        retry.dataset.bound = 'true'
        retry.addEventListener('click', () => renderForm(form, true))
      }
    }

    const sync = () => {
      frame = 0
      registrationForms().forEach(form => {
        ensureHost(form)
        renderForm(form)
      })
    }

    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(sync)
    }

    const handleSubmit = (event) => {
      const form = event.target
      if (!(form instanceof HTMLFormElement)) return
      if (!registrationForms().includes(form)) return

      const token = tokens.get(form) || ''
      if (!token) {
        event.preventDefault()
        event.stopImmediatePropagation()
        const host = ensureHost(form)
        const status = host.querySelector('.mgsm-turnstile-status')
        if (status) status.textContent = 'Completá La Verificación De Seguridad Antes De Crear La Cuenta.'
        host.scrollIntoView({ behavior: 'smooth', block: 'center' })
        if (form.dataset.turnstileReady !== 'true') renderForm(form, form.dataset.turnstileReady === 'error')
        return
      }
      stageTurnstileToken(token, form)
    }

    const handleConsumed = (event) => {
      const form = event.detail?.form
      if (!form) return
      tokens.delete(form)
      form.dataset.turnstileVerified = 'false'
      const widgetId = widgetIds.get(form)
      if (widgetId !== undefined && window.turnstile) {
        try { window.turnstile.reset(widgetId) } catch (_) {}
      }
      const status = form.querySelector('.mgsm-turnstile-status')
      if (status) status.textContent = 'Completá La Verificación Para Continuar.'
    }

    const handleRequired = () => {
      registrationForms().forEach(form => {
        const host = ensureHost(form)
        host.scrollIntoView({ behavior: 'smooth', block: 'center' })
        renderForm(form, form.dataset.turnstileReady === 'error')
      })
    }

    sync()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    document.addEventListener('submit', handleSubmit, true)
    window.addEventListener('mgsm:turnstile-consumed', handleConsumed)
    window.addEventListener('mgsm:turnstile-required', handleRequired)

    return () => {
      disposed = true
      observer.disconnect()
      document.removeEventListener('submit', handleSubmit, true)
      window.removeEventListener('mgsm:turnstile-consumed', handleConsumed)
      window.removeEventListener('mgsm:turnstile-required', handleRequired)
      if (frame) cancelAnimationFrame(frame)
      registrationForms().forEach(form => {
        const widgetId = widgetIds.get(form)
        if (widgetId !== undefined && window.turnstile) {
          try { window.turnstile.remove(widgetId) } catch (_) {}
        }
      })
    }
  }, [])

  return null
}
