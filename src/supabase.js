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
  if (typeof window === 'undefined') {
    return OFFICIAL_APP_URL
  }

  return window.location.hostname === 'localhost'
    ? window.location.origin
    : OFFICIAL_APP_URL
}

const client = url && key
  ? createClient(url, key)
  : null

if (client) {
  const originalSignUp = client.auth.signUp.bind(client.auth)

  client.auth.signUp = ({ email, password, options = {} }) => {
    return originalSignUp({
      email,
      password,
      options: {
        ...options,
        emailRedirectTo: getAuthRedirectUrl(),
      },
    })
  }
}

export const supabase = client
