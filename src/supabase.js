import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

const getAuthRedirectUrl = () => {
  if (typeof window === 'undefined') {
    return 'https://asistencia-voley.vercel.app/'
  }

  return window.location.hostname === 'localhost'
    ? window.location.origin
    : 'https://asistencia-voley.vercel.app/'
}

const client = url && key
  ? createClient(url, key)
  : null

// Keep the existing auth calls untouched in the rest of the app while making
// email confirmation return to the real application instead of localhost.
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
