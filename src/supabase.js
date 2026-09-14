import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
const OFFICIAL_APP_URL = 'https://voleysanmartin.com.ar/'

if (typeof window !== 'undefined') {
  const hostname = window.location.hostname.toLowerCase()
  const isVercelHost = hostname === 'asistencia-voley.vercel.app' || hostname.endsWith('.vercel.app')

  if (isVercelHost) {
    const official = new URL(OFFICIAL_APP_URL)
    official.pathname = window.location.pathname
    official.search = window.location.search
    official.hash = window.location.hash
    window.location.replace(official.toString())
  }
}

const getAuthRedirectUrl = () => {
  if (typeof window === 'undefined') return OFFICIAL_APP_URL
  return window.location.hostname === 'localhost'
    ? window.location.origin
    : OFFICIAL_APP_URL
}

const edgeBaseUrl = url ? url.replace(/\/$/, '') : ''

async function callAuthEmail(payload) {
  try {
    const response = await fetch(`${edgeBaseUrl}/functions/v1/auth-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    })

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      return {
        data: null,
        error: {
          message: body?.error || 'No se pudo enviar el correo. Revisá la dirección e intentá nuevamente.',
          status: response.status,
          suggestion: body?.suggestion || null,
        },
      }
    }
    return { data: body, error: null }
  } catch (_) {
    return {
      data: null,
      error: {
        message: 'No pudimos comunicarnos con el servicio de correo. Revisá tu conexión e intentá nuevamente.',
      },
    }
  }
}

const client = url && key
  ? createClient(url, key)
  : null

if (client) {
  const originalResend = client.auth.resend.bind(client.auth)

  client.auth.signUp = async ({ email, password, options = {} }) => {
    const cleanEmail = String(email || '').trim().toLowerCase()
    const { data, error } = await callAuthEmail({
      action: 'signup',
      email: cleanEmail,
      password,
      data: options?.data || {},
      redirect_to: options?.emailRedirectTo || getAuthRedirectUrl(),
    })

    if (error) {
      return { data: { user: null, session: null }, error }
    }

    return {
      data: {
        user: data?.user ? { ...data.user, email: cleanEmail } : null,
        session: null,
      },
      error: null,
    }
  }

  client.auth.resend = async ({ type, email, options = {} }) => {
    if (type !== 'signup') return originalResend({ type, email, options })

    const { data, error } = await callAuthEmail({
      action: 'resend',
      email: String(email || '').trim().toLowerCase(),
      redirect_to: options?.emailRedirectTo || getAuthRedirectUrl(),
    })

    return error
      ? { data: null, error }
      : { data: { messageId: data?.email_id || null, alreadyConfirmed: !!data?.already_confirmed }, error: null }
  }

  client.auth.resetPasswordForEmail = async (email, options = {}) => {
    const { data, error } = await callAuthEmail({
      action: 'recovery',
      email: String(email || '').trim().toLowerCase(),
      redirect_to: options?.redirectTo || getAuthRedirectUrl(),
    })

    return error ? { data: null, error } : { data: data || {}, error: null }
  }

  const originalStorageFrom = client.storage.from.bind(client.storage)
  client.storage.from = (bucket) => {
    const bucketApi = originalStorageFrom(bucket)
    const originalGetPublicUrl = bucketApi.getPublicUrl.bind(bucketApi)

    bucketApi.getPublicUrl = (path, options) => {
      if (typeof path === 'string' && /^https?:\/\//i.test(path)) {
        return { data: { publicUrl: path } }
      }
      return originalGetPublicUrl(path, options)
    }

    return bucketApi
  }
}

export const supabase = client
