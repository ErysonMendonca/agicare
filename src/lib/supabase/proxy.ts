// ════════════════════════════════════════════════════════════════
// Gate de rotas por sessão — chamado de src/proxy.ts a cada request.
//
// Antes renovava o token do Supabase e checava `auth.getUser()`. Agora só
// verifica a assinatura do cookie de sessão: não há chamada de rede nem ao
// banco, então o middleware fica mais rápido e não pode "deslogar" por
// falha de rede.
//
// IMPORTANTE: continua sendo uma checagem OTIMISTA (só confere se existe
// sessão válida, não o papel). A autorização real segue nos Server
// Components / Server Actions via requireRole()/requireClinico().
// ════════════════════════════════════════════════════════════════

import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO } from "@/lib/db/session";
import { sessaoDeCookie } from "@/lib/db/auth";

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  const sessao = sessaoDeCookie(request.cookies.get(COOKIE_SESSAO)?.value);

  // Rotas públicas: a tela de login é a raiz `/`. /api/auth precisa ser
  // pública para o próprio login/refresh funcionarem.
  const exactPublic = ["/", "/admin/login"];
  const prefixPublic = ["/cadastro", "/auth", "/recuperar-senha", "/api/auth"];
  const isPublic =
    exactPublic.includes(path) || prefixPublic.some((p) => path.startsWith(p));

  if (!sessao && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  // Já logado tentando abrir a tela de login → dashboard.
  if (sessao && (path === "/" || path === "/admin/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}
