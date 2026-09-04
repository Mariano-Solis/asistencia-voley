import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

const getAuthRedirectUrl = () => {
  if (typeof window === 'undefined') {
    return 'https://voleysanmartin.com.ar/'
  }

  return window.location.hostname === 'localhost'
    ? window.location.origin
    : 'https://voleysanmartin.com.ar/'
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
