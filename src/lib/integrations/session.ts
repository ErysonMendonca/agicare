import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'

/**
 * Política de SESSÃO e de SENHA — helpers de segurança (escopo: hardening).
 *
 * 1) TIMEOUT DE SESSÃO POR INATIVIDADE:
 *    rastreado por um cookie de "última atividade". O proxy (src/proxy.ts)
 *    carimba o cookie a cada request autenticado e, ao exceder o limite,
 *    encerra a sessão (limpa os cookies de auth do Supabase) e redireciona.
 *    Observação: isto é uma camada de APLICAÇÃO. O JWT do Supabase continua
 *    válido até expirar/rotacionar; aqui forçamos o re-login por inatividade.
 *
 *    O limite vem de `clinic_settings.security.sessionTimeoutMin` (configurável
 *    pelo gestor na tela 15.1); o proxy lê esse valor e o repassa às funções
 *    abaixo. Fallback: ENV `SESSION_IDLE_MINUTES` e, por fim, 120 min.
 *
 * 2) POLÍTICA DE SENHA: validador puro (Zod) para usar na action de troca/
 *    definição de senha. Hoje NÃO há action de troca de senha no projeto —
 *    quando existir, importe `buildSenhaSchema`/`validarPoliticaSenha` na borda
 *    (antes de `supabase.auth.updateUser({ password })`), preferencialmente
 *    com a política vigente em clinic_settings.security.passwordPolicy.
 */

// ── Timeout de sessão ─────────────────────────────────────────────
export const ACTIVITY_COOKIE = 'agicare_last_activity'

/**
 * Limite de inatividade em ms. Precedência: valor configurado (clinic_settings)
 * → ENV `SESSION_IDLE_MINUTES` → 120 min.
 */
export function idleLimitMs(configuredMinutes?: number | null): number {
  const cfg = Number(configuredMinutes)
  if (Number.isFinite(cfg) && cfg > 0) return cfg * 60 * 1000
  const env = Number(process.env.SESSION_IDLE_MINUTES)
  const minutes = Number.isFinite(env) && env > 0 ? env : 120
  return minutes * 60 * 1000
}

export type IdleState = 'fresh' | 'active' | 'expired'

/**
 * Estado de inatividade a partir do valor cru do cookie (epoch ms em string).
 *  - 'fresh'   → sem cookie ainda (primeira request da sessão) → só carimbar.
 *  - 'active'  → dentro do limite.
 *  - 'expired' → excedeu o limite → encerrar.
 */
export function idleState(
  lastActivityRaw: string | undefined,
  nowMs: number = Date.now(),
  configuredMinutes?: number | null,
): IdleState {
  if (!lastActivityRaw) return 'fresh'
  const last = Number(lastActivityRaw)
  if (!Number.isFinite(last) || last <= 0) return 'fresh'
  return nowMs - last > idleLimitMs(configuredMinutes) ? 'expired' : 'active'
}

/** Opções do cookie de atividade (httpOnly, sameSite lax, secure em prod). */
function activityCookieOptions(configuredMinutes?: number | null) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // maxAge espelha o limite: o cookie morre junto com a janela de inatividade.
    maxAge: Math.floor(idleLimitMs(configuredMinutes) / 1000),
  }
}

/** Carimba a última atividade (agora) no response. */
export function stampActivity(
  response: NextResponse,
  nowMs: number = Date.now(),
  configuredMinutes?: number | null,
): NextResponse {
  response.cookies.set(
    ACTIVITY_COOKIE,
    String(nowMs),
    activityCookieOptions(configuredMinutes),
  )
  return response
}

/**
 * Lê o timeout de inatividade configurado (clinic_settings.security.
 * sessionTimeoutMin) usando os cookies do request (RLS escopa à clínica do
 * usuário). Retorna `null` quando não há valor válido (→ fallback ENV/120) ou
 * em demo/sem Supabase. Best-effort: nunca lança (degrada para fallback).
 *
 * Cliente read-only (setAll no-op): NÃO interfere nos cookies de auth — o
 * refresh de sessão é responsabilidade exclusiva do `updateSession`.
 */
export async function fetchSessionTimeoutMinutes(
  request: NextRequest,
): Promise<number | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: () => {},
        },
      },
    )
    const { data } = await supabase
      .from('clinic_settings')
      .select('security')
      .limit(1)
      .maybeSingle()

    const sec = data?.security
    if (sec && typeof sec === 'object' && !Array.isArray(sec)) {
      const min = Number((sec as Record<string, unknown>).sessionTimeoutMin)
      if (Number.isFinite(min) && min > 0) return min
    }
    return null
  } catch {
    return null
  }
}

/**
 * Limpa os cookies de auth do Supabase (sb-...-auth-token e chunks) + o cookie
 * de atividade. Usado ao expirar por inatividade — encerra a sessão de fato.
 */
export function clearSessionCookies(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  for (const c of request.cookies.getAll()) {
    if (/^sb-.*-auth-token(\.\d+)?$/.test(c.name)) {
      response.cookies.set(c.name, '', { path: '/', maxAge: 0 })
    }
  }
  response.cookies.set(ACTIVITY_COOKIE, '', { path: '/', maxAge: 0 })
  return response
}

/**
 * Constrói o redirect de "sessão expirada por inatividade": vai para a raiz
 * (tela de login) com `?expirado=1` e limpa os cookies de sessão.
 */
export function buildExpiredRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = '/'
  url.search = ''
  url.searchParams.set('expirado', '1')
  const res = NextResponse.redirect(url)
  return clearSessionCookies(request, res)
}

// ── Política de senha ─────────────────────────────────────────────
/**
 * Os validadores de senha foram extraídos para `@/lib/validation/password`
 * (módulo PURO, sem imports de servidor) para poderem ser reusados também no
 * CLIENT (formulário de troca de senha) sem arrastar `next/server`/`@supabase/ssr`
 * para o bundle do browser. Re-exportados aqui por compatibilidade.
 */
export {
  buildSenhaSchema,
  senhaSchema,
  normalizePolicy,
  validarPoliticaSenha,
  type PasswordPolicy,
} from '@/lib/validation/password'
