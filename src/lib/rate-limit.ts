import "server-only";
import { headers } from "next/headers";

/**
 * Rate-limit EM MEMÓRIA (por processo). Simples e sem dependência externa.
 *
 * ⚠️ Limitação conhecida (decisão do dono): em ambiente serverless (Vercel) cada
 * instância tem o SEU contador e ele zera em cold start — a proteção é
 * "best-effort" (dificulta força-bruta, mas não é um limite global forte). Para
 * um limite robusto entre instâncias, migrar para um store compartilhado
 * (Postgres/Upstash) — ver follow-up.
 */

type Hit = { count: number; resetAt: number };

// Map global de contadores. `globalThis` sobrevive ao HMR em dev.
const store: Map<string, Hit> =
  (globalThis as { __rateStore?: Map<string, Hit> }).__rateStore ??
  ((globalThis as { __rateStore?: Map<string, Hit> }).__rateStore = new Map());

const SOFT_LIMIT = 1000; // acima disto, limpa expiradas
const HARD_CAP = 20000; // teto rígido: evita OOM sob flood de chaves forjadas

/**
 * Contém o crescimento do Map: (1) remove expiradas quando passa do soft-limit;
 * (2) se ainda acima do teto rígido, faz evicção das entradas que reabrem mais
 * cedo (menor resetAt) até voltar ao teto. Roda na leitura E na escrita.
 */
function prune(now: number) {
  if (store.size < SOFT_LIMIT) return;
  for (const [k, v] of store) if (now >= v.resetAt) store.delete(k);
  if (store.size <= HARD_CAP) return;
  const ordenadas = [...store.entries()].sort(
    (a, b) => a[1].resetAt - b[1].resetAt,
  );
  const excedente = store.size - HARD_CAP;
  for (let i = 0; i < excedente; i++) store.delete(ordenadas[i]![0]);
}

export type RateResult = {
  /** true = dentro do limite; false = estourou (bloquear). */
  ok: boolean;
  /** segundos até a janela reabrir (quando bloqueado). */
  retryAfterSec: number;
};

/** Só CONSULTA se a chave já estourou o limite (não incrementa). */
export function isRateLimited(key: string, limit: number): RateResult {
  const now = Date.now();
  prune(now);
  const cur = store.get(key);
  if (!cur || now >= cur.resetAt) return { ok: true, retryAfterSec: 0 };
  if (cur.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((cur.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Registra UMA ocorrência (ex.: tentativa falha) na janela da chave. */
export function registerHit(key: string, windowMs: number): void {
  const now = Date.now();
  prune(now);
  const cur = store.get(key);
  if (!cur || now >= cur.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  cur.count += 1;
}

/**
 * Consome uma unidade e diz se PODE prosseguir. Use quando TODA tentativa deve
 * contar (ex.: troca de senha). Bloqueia a partir do momento em que passa do
 * limite, sem seguir incrementando indefinidamente.
 */
export function consume(key: string, limit: number, windowMs: number): RateResult {
  const check = isRateLimited(key, limit);
  if (!check.ok) return check;
  registerHit(key, windowMs);
  return { ok: true, retryAfterSec: 0 };
}

/**
 * IP do cliente. No Vercel, prefira headers setados PELA PLATAFORMA
 * (`x-vercel-forwarded-for` / `x-real-ip`), que o cliente NÃO consegue
 * sobrescrever. `x-forwarded-for` é uma cadeia onde o 1º valor é forjável pelo
 * cliente — só a usamos como último recurso, pegando o ÚLTIMO IP (o que o proxy
 * confiável anexou), não o primeiro.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const vercel = h.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const partes = xff.split(",");
    return partes[partes.length - 1]!.trim();
  }
  return "unknown";
}

/** Minutos legíveis para a mensagem de bloqueio. */
export function retryLabel(retryAfterSec: number): string {
  const min = Math.ceil(retryAfterSec / 60);
  return min <= 1 ? "cerca de 1 minuto" : `cerca de ${min} minutos`;
}
