// ════════════════════════════════════════════════════════════════
// Cliente de SERVIDOR — agora sobre MySQL.
//
// O nome do módulo e a assinatura (`await createClient()`) foram mantidos
// para os ~110 arquivos que importam daqui não precisarem mudar. O que
// mudou é o que está por baixo: em vez de HTTP para o PostgREST, SQL direto
// no MySQL (ver src/lib/db/).
//
// ESCOPO DE CLÍNICA (substituto da RLS): o cliente é criado com a clínica
// ativa da sessão, e o query builder injeta `clinic_id` em toda tabela que
// tenha a coluna. Sem sessão o escopo é `null`, o que aqui significa "sem
// filtro" — por isso a autorização de rota (proxy.ts) e os requireRole()
// continuam sendo o que impede uma request anônima de chegar até aqui.
// ════════════════════════════════════════════════════════════════

import { criarClienteDb, type ClienteDb } from "@/lib/db/query-builder";
import { criarAuth, type Auth } from "@/lib/db/auth";
import { criarStorage, type Storage } from "@/lib/db/storage";
import { lerSessao } from "@/lib/db/session";

export type Cliente = ClienteDb & { auth: Auth; storage: Storage };

/**
 * Cliente com escopo na clínica ativa da sessão.
 *
 * Continua assíncrono (como era por causa do `await cookies()`), então todos
 * os `await createClient()` existentes seguem válidos sem alteração.
 */
export async function createClient(): Promise<Cliente> {
  const sessao = await lerSessao();
  const db = criarClienteDb(sessao?.activeClinicId ?? null);
  return Object.assign(db, { auth: criarAuth(), storage: criarStorage() });
}
