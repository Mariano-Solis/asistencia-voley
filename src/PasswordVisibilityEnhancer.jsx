import { useEffect } from 'react'

const SELECTOR = [
  '.auth-card input[type="password"]',
  '.professor-signup-card input[type="password"]',
  '.voley-auth-modal input[type="password"]',
].join(',')

function installToggle(input) {
  if (!(input instanceof HTMLInputElement)) return
  if (input.dataset.passwordToggleInstalled === 'true') return

  input.dataset.passwordToggleInstalled = 'true'
  input.dataset.showPassword = 'false'

  const row = document.createElement('label')
  row.className = 'password-visibility-toggle'
  row.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:10px',
    'margin:8px 0 12px',
    'font-size:15px',
    'font-weight:700',
    'line-height:1.3',
    'color:#25364d',
    'cursor:pointer',
    'user-select:none',
  ].join(';')

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.setAttribute('aria-label', 'Mostrar contraseña')
  checkbox.style.cssText = 'width:21px;height:21px;min-width:21px;margin:0;accent-color:#1769e0;cursor:pointer;'

  const text = document.createElement('span')
  text.textContent = 'Mostrar contraseña'

  const syncType = () => {
    const shouldShow = input.dataset.showPassword === 'true'
    const expected = shouldShow ? 'text' : 'password'
    if (input.type !== expected) input.type = expected
  }

  checkbox.addEventListener('change', () => {
    input.dataset.showPassword = checkbox.checked ? 'true' : 'false'
    syncType()
    input.focus({ preventScroll: true })
    const end = input.value.length
    try { input.setSelectionRange(end, end) } catch (_) {}
  })

  row.append(checkbox, text)
  input.insertAdjacentElement('afterend', row)

  const attributeObserver = new MutationObserver(syncType)
  attributeObserver.observe(input, { attributes: true, attributeFilter: ['type'] })
  input._passwordVisibilityObserver = attributeObserver
}

export default function PasswordVisibilityEnhancer() {
  useEffect(() => {
    const enhance = () => {
      document.querySelectorAll(SELECTOR).forEach(installToggle)
    }

    enhance()
    const observer = new MutationObserver(enhance)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      document.querySelectorAll('[data-password-toggle-installed="true"]').forEach((input) => {
        input._passwordVisibilityObserver?.disconnect?.()
      })
    }
  }, [])

  return null
}
