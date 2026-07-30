// ════════════════════════════════════════════════════════════════
// Cliente ADMINISTRATIVO — agora sobre MySQL.
//
// Equivale ao antigo service-role: NÃO aplica escopo de clínica, ou seja,
// enxerga dado de todas as clínicas. Antes isso significava "ignora RLS";
// aqui significa "o query builder não injeta clinic_id".
//
// ⚠️ Só no servidor, e só em rotina de confiança (login resolvendo username,
// provisionamento de usuário, cron). Nunca com filtro vindo do usuário sem
// validar antes — é o caminho que ignora o isolamento multitenant.
// ════════════════════════════════════════════════════════════════

import { criarClienteDb, type ClienteDb } from "@/lib/db/query-builder";
import { criarAuth, type Auth } from "@/lib/db/auth";
import { criarStorage, type Storage } from "@/lib/db/storage";

export type ClienteServico = ClienteDb & { auth: Auth; storage: Storage };

export function createServiceClient(): ClienteServico {
  const db = criarClienteDb(null); // null = sem escopo de clínica
  return Object.assign(db, { auth: criarAuth(), storage: criarStorage() });
}
