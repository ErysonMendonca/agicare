import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import {
  ACTIVITY_COOKIE,
  buildExpiredRedirect,
  fetchSessionTimeoutMinutes,
  idleState,
  stampActivity,
} from '@/lib/integrations/session'

/**
 * Proxy (antigo Middleware — renomeado no Next.js 16).
 *
 * Responsabilidades:
 *  1) Renova a sessão do Supabase + gate otimista de rotas (updateSession).
 *  2) Enforcement de TIMEOUT DE SESSÃO POR INATIVIDADE (120 min): carimba o
 *     cookie de última atividade a cada request autenticado e, ao exceder o
 *     limite, encerra a sessão (limpa cookies de auth) e redireciona ao login.
 *
 * O timeout só se aplica a ROTAS PROTEGIDAS e quando há cookies de auth do
 * Supabase — visitantes anônimos e rotas públicas passam direto.
 */

// Rotas públicas (espelha updateSession): não exigem sessão nem timeout.
const EXACT_PUBLIC = ['/', '/admin/login']
const PREFIX_PUBLIC = ['/cadastro', '/auth', '/recuperar-senha']

function isPublicPath(path: string): boolean {
  return (
    EXACT_PUBLIC.includes(path) || PREFIX_PUBLIC.some((p) => path.startsWith(p))
  )
}

/** Há cookies de sessão do Supabase no request? (evita falso-expirado anônimo) */
function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const protectedPath = !isPublicPath(path)
  const guarded = protectedPath && hasAuthCookie(request)

  // Limite de inatividade configurado (clinic_settings.security.sessionTimeoutMin);
  // null → fallback ENV/120. Lido só quando há sessão a proteger.
  let idleMinutes: number | null = null

  // 1) Enforcement de inatividade: só em rota protegida e com sessão presente.
  if (guarded) {
    idleMinutes = await fetchSessionTimeoutMinutes(request)
    const state = idleState(
      request.cookies.get(ACTIVITY_COOKIE)?.value,
      Date.now(),
      idleMinutes,
    )
    if (state === 'expired') {
      // Encerra por inatividade antes de renovar a sessão.
      return buildExpiredRedirect(request)
    }
  }

  // 2) Renovação de sessão + gate otimista (Supabase).
  const response = await updateSession(request)

  // 3) Carimba a atividade (agora) em rotas protegidas com sessão ativa.
  //    Não toca redirects de login/expiração nem rotas públicas.
  if (guarded) {
    stampActivity(response, Date.now(), idleMinutes)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Roda em todas as rotas, exceto estáticos e imagens:
     * - _next/static, _next/image, favicon, e arquivos com extensão.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
