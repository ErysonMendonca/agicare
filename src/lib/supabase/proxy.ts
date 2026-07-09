import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isSupabaseConfigured } from './config'

/**
 * Atualiza/renova a sessão do Supabase a cada request e aplica um redirecionamento
 * "otimista" para rotas protegidas. Chamado a partir de `src/proxy.ts`.
 *
 * IMPORTANTE: isto é apenas uma checagem otimista (ver docs de data-security do Next 16).
 * A autorização real (papel/role) deve ser reforçada nos Server Components/Route Handlers.
 */
export async function updateSession(request: NextRequest) {


  // Fail-closed: sem Supabase configurado em produção, bloqueia rotas protegidas.
  if (!isSupabaseConfigured()) {
    const publicPaths = ['/login', '/cadastro', '/auth', '/recuperar-senha', '/admin/login', '/']
    const isPublic = publicPaths.some((p) => request.nextUrl.pathname === p || request.nextUrl.pathname.startsWith(p + '/'))
    if (isPublic) return NextResponse.next({ request })
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // NÃO insira lógica entre createServerClient e getUser() — pode causar logout aleatório.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Rotas públicas (sem login): a tela de login é a raiz `/`. Tudo o mais exige sessão.
  const path = request.nextUrl.pathname
  const exactPublic = ['/', '/admin/login']
  const prefixPublic = ['/cadastro', '/auth', '/recuperar-senha']
  const isPublic =
    exactPublic.includes(path) || prefixPublic.some((p) => path.startsWith(p))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('redirect', path)
    return NextResponse.redirect(url)
  }

  // Usuário logado tentando acessar a tela de login → manda pro dashboard.
  if (user && (path === '/' || path === '/admin/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
