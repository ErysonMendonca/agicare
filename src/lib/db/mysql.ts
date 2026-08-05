// ════════════════════════════════════════════════════════════════
// Pool de conexões MySQL. Substitui o transporte HTTP do Supabase
// (PostgREST) por acesso direto ao banco.
//
// Server-only: nunca importe isto num Client Component. As credenciais do
// banco não podem ir para o browser.
// ════════════════════════════════════════════════════════════════

import mysql from "mysql2/promise";

export type Pool = mysql.Pool;

let pool: Pool | null = null;

function exigir(nome: string, padrao?: string): string {
  const v = process.env[nome] ?? padrao;
  if (v === undefined) {
    throw new Error(
      `Variável de ambiente ${nome} ausente. Configure o acesso ao MySQL no .env.local.`,
    );
  }
  return v;
}

/**
 * Pool único do processo. O Next em dev recarrega os módulos a cada
 * alteração, então guardamos no globalThis para não abrir um pool novo a
 * cada hot reload (o MySQL recusaria conexões depois de algumas dezenas).
 */
export function getPool(): Pool {
  const g = globalThis as typeof globalThis & { __agicarePool?: Pool };
  if (g.__agicarePool) return g.__agicarePool;
  if (pool) return pool;

  // TLS: bancos gerenciados (e conexão entre máquinas) exigem. MYSQL_SSL=1
  // liga com verificação; MYSQL_SSL=skip-verify aceita certificado
  // autoassinado — só use quando a rede entre app e banco já for confiável.
  const modoSsl = process.env.MYSQL_SSL ?? "";
  const ssl =
    modoSsl === "1" || modoSsl === "true"
      ? { rejectUnauthorized: true }
      : modoSsl === "skip-verify"
        ? { rejectUnauthorized: false }
        : undefined;

  pool = mysql.createPool({
    host: exigir("MYSQL_HOST", "127.0.0.1"),
    port: Number(exigir("MYSQL_PORT", "3306")),
    user: exigir("MYSQL_USER", "root"),
    password: process.env.MYSQL_PASSWORD ?? "",
    database: exigir("MYSQL_DATABASE", "agicare"),
    ...(ssl ? { ssl } : {}),
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE ?? 10),
    // Sem timeout, um banco inacessível deixa a request pendurada até o
    // navegador desistir, sem erro no log.
    connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT_MS ?? 10_000),
    // Mantém as conexões do pool vivas: firewall/NAT de VPS costuma cortar
    // conexão ociosa em silêncio, e a próxima query falharia.
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    // Datas como string crua: a conversão para o formato esperado pela
    // aplicação é feita no query builder, com base no schema-meta. Deixar o
    // driver criar Date aqui embaralharia o fuso (o banco guarda UTC).
    dateStrings: true,
    // Sem isso, o driver devolve DECIMAL como string.
    decimalNumbers: true,
    charset: "utf8mb4",
    timezone: "Z",
    supportBigNumbers: true,
  });

  if (process.env.NODE_ENV !== "production") g.__agicarePool = pool;
  return pool;
}

/**
 * Linha genérica do banco.
 *
 * O valor é `any` DE PROPÓSITO: sem tipos gerados, o supabase-js também
 * devolvia `any`, e os ~540 pontos de chamada foram escritos contando com
 * isso (`r.code ?? "—"` atribuído a `string`, por exemplo). Usar `unknown`
 * aqui seria mais correto no vácuo, mas exigiria cast em centenas de
 * lugares — trabalho que só existiria por causa da troca de banco e que
 * abriria espaço para erro em cada conversão feita à mão.
 *
 * O caminho para tipar isso de verdade é gerar tipos por tabela a partir do
 * schema-meta e parametrizar `from<T>()` — melhoria separada desta migração.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Linha = Record<string, any>;

/** Executa SQL parametrizado e devolve as linhas. */
export async function consultar<T = Linha>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await getPool().query(sql, params);
  return rows as T[];
}

export type ResultadoEscrita = { affectedRows: number; insertId: number };

/** Executa INSERT/UPDATE/DELETE e devolve o resumo. */
export async function executar(
  sql: string,
  params: unknown[] = [],
): Promise<ResultadoEscrita> {
  const [res] = await getPool().query(sql, params);
  const r = res as mysql.ResultSetHeader;
  return { affectedRows: r.affectedRows ?? 0, insertId: r.insertId ?? 0 };
}

/** Roda uma função dentro de uma transação, com rollback em caso de erro. */
export async function transacao<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
