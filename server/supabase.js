// Supabase client for the backend. Uses the service_role key, so it bypasses
// RLS — this is server-only and the key must NEVER reach the browser. Access is
// gated at the API layer (Firebase token + email allowlist), not by RLS.
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  // Fail loudly at startup rather than on the first query.
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
}

export const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export const LIBRARY_BUCKET = 'library'
