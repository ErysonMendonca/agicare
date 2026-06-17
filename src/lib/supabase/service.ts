import { createClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase com SERVICE-ROLE (ignora RLS).
 * ⚠️ NUNCA importe isto em Client Components ou em código que chega ao browser.
 * Use somente em Route Handlers / Server Actions de confiança.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}
