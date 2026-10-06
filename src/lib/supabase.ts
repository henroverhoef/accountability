import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anonKey)

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing-key', {
  auth: {
    // Your sign-in is remembered on this phone. There are no email links to read from the URL.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
