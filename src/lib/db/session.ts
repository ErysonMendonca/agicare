// ════════════════════════════════════════════════════════════════
// Sessão assinada em cookie — substitui o Supabase Auth (JWT + Custom
// Access Token Hook).
//
// O Supabase entregava um JWT com `app_metadata.active_clinic_id` carimbado
// pelo hook da migration 0022. Aqui a mesma informação vive num cookie
// assinado com HMAC-SHA256: o servidor consegue confiar no conteúdo sem
// consultar o banco a cada request, e o usuário não consegue alterá-lo
// (trocar o clinic_id daria acesso a outra clínica).
//
// Não é criptografado, é ASSINADO: o conteúdo é legível pelo usuário (não
// guarde segredo aqui), mas qualquer alteração invalida a assinatura.
// ════════════════════════════════════════════════════════════════

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

export const COOKIE_SESSAO = "agicare_sessao";
const DURACAO_MS = 8 * 60 * 60 * 1000; // 8h — turno de trabalho

export type Sessao = {
  userId: string;
  email: string | null;
  /** Clínica ativa — equivalente ao claim app_metadata.active_clinic_id. */
  activeClinicId: string | null;
  /** Expiração (epoch ms). */
  exp: number;
};

let segredoAvisado = false;

/**
 * Só é desenvolvimento quando NODE_ENV diz EXPLICITAMENTE "development".
 * Qualquer outro valor (produção, teste, vazio, ou um NODE_ENV esquecido no
 * .env) cai no caminho seguro. O contrário — liberar tudo que "não é
 * production" — deixaria o servidor sem segredo e com cookie sem `secure`
 * caso a variável não chegasse configurada.
 */
const ehDesenvolvimento = process.env.NODE_ENV === "development";

function segredo(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return s;
  if (!ehDesenvolvimento) {
    throw new Error(
      "AUTH_SECRET ausente ou curto (mínimo 32 caracteres). " +
      "Sem ele as sessões não podem ser assinadas com segurança. " +
      "Gere um com: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"",
    );
  }
  // Em desenvolvimento, deriva um segredo estável do diretório do projeto
  // para a sessão sobreviver ao hot reload, avisando uma vez.
  if (!segredoAvisado) {
    segredoAvisado = true;
    console.warn(
      "[auth] AUTH_SECRET não definido — usando segredo de desenvolvimento. " +
      "Defina AUTH_SECRET no .env.local antes de qualquer uso real.",
    );
  }
  return `dev-only-${process.cwd()}-agicare`;
}

const b64url = (b: Buffer) => b.toString("base64url");

function assinar(payload: string): string {
  return b64url(createHmac("sha256", segredo()).update(payload).digest());
}

/** Serializa e assina a sessão. */
export function selar(s: Sessao): string {
  const corpo = b64url(Buffer.from(JSON.stringify(s), "utf8"));
  return `${corpo}.${assinar(corpo)}`;
}

/** Verifica a assinatura e devolve a sessão, ou null se inválida/expirada. */
export function abrir(token: string | undefined): Sessao | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const corpo = token.slice(0, i);
  const assinatura = token.slice(i + 1);

  const esperada = Buffer.from(assinar(corpo));
  const recebida = Buffer.from(assinatura);
  // Comparação em tempo constante: evita descobrir a assinatura por timing.
  if (esperada.length !== recebida.length) return null;
  if (!timingSafeEqual(esperada, recebida)) return null;

  try {
    const s = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as Sessao;
    if (typeof s.exp !== "number" || s.exp < Date.now()) return null;
    if (typeof s.userId !== "string" || !s.userId) return null;
    return s;
  } catch {
    return null;
  }
}

export function novaSessao(
  userId: string,
  email: string | null,
  activeClinicId: string | null,
): Sessao {
  return { userId, email, activeClinicId, exp: Date.now() + DURACAO_MS };
}

/** Lê a sessão do cookie da request atual (server-only). */
export async function lerSessao(): Promise<Sessao | null> {
  try {
    const jar = await cookies();
    return abrir(jar.get(COOKIE_SESSAO)?.value);
  } catch {
    // Fora de um contexto de request (ex.: script) — sem sessão.
    return null;
  }
}

const opcoesCookie = {
  httpOnly: true,          // inacessível ao JavaScript da página
  sameSite: "lax" as const, // sobrevive à navegação, bloqueia CSRF entre sites
  path: "/",
  // `secure` exige HTTPS. Fora de desenvolvimento é sempre ligado — se o
  // servidor estiver em HTTP puro, o login não vai funcionar, e isso é
  // intencional: enviar o cookie de sessão em claro é pior do que não logar.
  secure: !ehDesenvolvimento,
};

/**
 * Grava a sessão no cookie. Só funciona em Server Action / Route Handler —
 * num Server Component o Next proíbe gravar cookie, e nesse caso a chamada
 * é ignorada (era o mesmo comportamento do cliente Supabase).
 */
export async function gravarSessao(s: Sessao): Promise<void> {
  try {
    const jar = await cookies();
    jar.set(COOKIE_SESSAO, selar(s), {
      ...opcoesCookie,
      expires: new Date(s.exp),
    });
  } catch {
    /* Server Component: ignorável */
  }
}

export async function apagarSessao(): Promise<void> {
  try {
    const jar = await cookies();
    jar.set(COOKIE_SESSAO, "", { ...opcoesCookie, maxAge: 0 });
  } catch {
    /* Server Component: ignorável */
  }
}

/** Token opaco para "lembrar" uma ação sem estado no banco (não usado ainda). */
export function tokenAleatorio(): string {
  return randomBytes(32).toString("base64url");
}
