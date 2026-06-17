import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Cliente Supabase para o SERVER (Server Components, Route Handlers, Server Actions).
 * Usa anon key + cookies de sessão. No Next.js 16 `cookies()` é assíncrono → await.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Chamado de um Server Component — ignorável quando há proxy
            // (src/proxy.ts) cuidando do refresh da sessão.
          }
        },
      },
    },
  )
}
