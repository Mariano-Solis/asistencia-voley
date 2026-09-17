let pendingToken = ''
let pendingForm = null

export function stageTurnstileToken(token, form = null) {
  pendingToken = String(token || '')
  pendingForm = form || null
}

export function consumeTurnstileToken() {
  const token = pendingToken
  const form = pendingForm
  pendingToken = ''
  pendingForm = null
  return { token, form }
}

export function notifyTurnstileConsumed(form) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('mgsm:turnstile-consumed', { detail: { form } }))
}
