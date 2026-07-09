import { createServiceClient } from "@/lib/supabase/service";
import { isGestor } from "@/lib/auth";

// ════════════════════════════════════════════════════════════════
// Leitura da trilha de auditoria genérica (system_logs, 0076) para a
// tela admin "Log do Sistema".
//
// ⚠️ LEITURA GLOBAL / CROSS-TENANT — por DECISÃO EXPLÍCITA DO DONO o
// admin enxerga TODAS as clínicas (diferente do resto do sistema, que é
// estritamente por-clínica). Por isso usamos o SERVICE-ROLE (ignora RLS)
// para o SELECT cross-tenant. A FRONTEIRA DE SEGURANÇA é o gate
// `isGestor()` + service-role: nada é lido antes de confirmar admin.
// ════════════════════════════════════════════════════════════════

export type SystemLogFiltro = {
  q?: string;
  module?: string;
  action?: string;
  actorId?: string;
  clinicId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

// Normaliza os limites do filtro de data. Um <input type=date> manda só
// "YYYY-MM-DD"; para o timestamptz, o início é 00:00 e o fim é 23:59:59.999
// do MESMO dia (senão o dia final inteiro seria omitido). Valores já com
// hora (ISO completo) passam intactos.
function toRangeStart(v: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000` : v;
}
function toRangeEnd(v: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:59.999` : v;
}

export type SystemLogRow = {
  id: string;
  createdAt: string;
  actorName: string;
  actorRole: string;
  clinicId: string | null;
  clinicName: string | null;
  action: string;
  module: string;
  summary: string;
  entity: string | null;
  entityId: string | null;
};

const DEMO_ROWS: SystemLogRow[] = [
  {
    id: "demo-1",
    createdAt: "2026-07-03T08:31:00.000Z",
    actorName: "Dra. Ana Beatriz Costa",
    actorRole: "medico",
    clinicId: "00000000-0000-0000-0000-000000000001",
    clinicName: "Clínica Demonstração",
    action: "login",
    module: "auth",
    summary: "Entrou no sistema",
    entity: null,
    entityId: null,
  },
  {
    id: "demo-2",
    createdAt: "2026-07-03T08:12:00.000Z",
    actorName: "Carlos Mendes",
    actorRole: "recepcao",
    clinicId: "00000000-0000-0000-0000-000000000001",
    clinicName: "Clínica Demonstração",
    action: "create",
    module: "pacientes",
    summary: "Cadastrou o paciente João Pereira Lima",
    entity: "patient",
    entityId: "p-1024",
  },
  {
    id: "demo-3",
    createdAt: "2026-07-02T17:48:00.000Z",
    actorName: "Dr. João Silva",
    actorRole: "medico",
    clinicId: "00000000-0000-0000-0000-000000000002",
    clinicName: "Clínica Vida",
    action: "update",
    module: "prontuario",
    summary: "Atualizou a evolução de Maria Silva Santos",
    entity: "medical_record",
    entityId: "mr-77",
  },
  {
    id: "demo-4",
    createdAt: "2026-07-02T16:03:00.000Z",
    actorName: "Administrador",
    actorRole: "admin",
    clinicId: null,
    clinicName: null,
    action: "export",
    module: "relatorios",
    summary: "Exportou o relatório de faturamento",
    entity: "report",
    entityId: null,
  },
  {
    id: "demo-5",
    createdAt: "2026-07-02T12:20:00.000Z",
    actorName: "Carlos Mendes",
    actorRole: "recepcao",
    clinicId: "00000000-0000-0000-0000-000000000001",
    clinicName: "Clínica Demonstração",
    action: "logout",
    module: "auth",
    summary: "Saiu do sistema",
    entity: null,
    entityId: null,
  },
];

/**
 * Lista GLOBAL da trilha de auditoria (mais recentes primeiro), paginada.
 * Admin-only: não-gestor recebe lista vazia. Demo devolve mock.
 */
export async function getSystemLogs(
  f: SystemLogFiltro,
): Promise<{ rows: SystemLogRow[]; total: number }> {
  const limit = f.limit ?? 50;
  const offset = f.offset ?? 0;



  // Gate de segurança: só admin. É a fronteira antes do service-role.
  if (!(await isGestor())) return { rows: [], total: 0 };

  try {
    const supabase = createServiceClient();

    let query = supabase
      .from("system_logs")
      .select(
        "id, created_at, actor_name, actor_role, clinic_id, action, module, summary, entity, entity_id",
        { count: "exact" },
      );

    if (f.q) {
      // Sanitiza o termo: vírgula/parênteses/barra quebram a sintaxe do
      // filtro .or() do PostgREST (e seriam vetor de filter-injection);
      // `%`/`_` são curingas do ilike. Trocamos tudo por espaço.
      const safe = f.q.replace(/[,()\\%_]/g, " ").trim();
      if (safe) {
        query = query.or(`summary.ilike.%${safe}%,actor_name.ilike.%${safe}%`);
      }
    }
    if (f.module) query = query.eq("module", f.module);
    if (f.action) query = query.eq("action", f.action);
    if (f.actorId) query = query.eq("actor_user_id", f.actorId);
    if (f.clinicId) query = query.eq("clinic_id", f.clinicId);
    if (f.from) query = query.gte("created_at", toRangeStart(f.from));
    // `to` só com a data (YYYY-MM-DD) cobriria só 00:00:00 → o dia inteiro
    // ficaria de fora. Estende para o fim do dia (inclusive).
    if (f.to) query = query.lte("created_at", toRangeEnd(f.to));

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error || !data) return { rows: [], total: 0 };

    // Resolve nome das clínicas em um segundo select (evita FK/join implícito).
    const clinicIds = Array.from(
      new Set(
        data
          .map((r) => r.clinic_id as string | null)
          .filter((id): id is string => !!id),
      ),
    );
    const clinicNames = new Map<string, string>();
    if (clinicIds.length > 0) {
      const { data: clinics } = await supabase
        .from("clinics")
        .select("id, name")
        .in("id", clinicIds);
      for (const c of clinics ?? []) {
        clinicNames.set(c.id as string, (c.name as string | null) ?? "—");
      }
    }

    const rows: SystemLogRow[] = data.map((r) => {
      const clinicId = (r.clinic_id as string | null) ?? null;
      return {
        id: r.id as string,
        createdAt: (r.created_at as string | null) ?? "",
        actorName: (r.actor_name as string | null) ?? "—",
        actorRole: (r.actor_role as string | null) ?? "—",
        clinicId,
        clinicName: clinicId ? (clinicNames.get(clinicId) ?? null) : null,
        action: (r.action as string | null) ?? "other",
        module: (r.module as string | null) ?? "—",
        summary: (r.summary as string | null) ?? "—",
        entity: (r.entity as string | null) ?? null,
        entityId: (r.entity_id as string | null) ?? null,
      };
    });

    return { rows, total: count ?? rows.length };
  } catch {
    return { rows: [], total: 0 };
  }
}

/**
 * Opções para os filtros da tela (módulos, ações, atores, clínicas).
 * Admin-only: não-gestor recebe listas vazias.
 */
export async function getSystemLogFilterOptions(): Promise<{
  modules: string[];
  actions: string[];
  actors: { id: string; name: string }[];
  clinics: { id: string; name: string }[];
}> {
  const empty = { modules: [], actions: [], actors: [], clinics: [] };



  if (!(await isGestor())) return empty;

  try {
    const supabase = createServiceClient();

    const [{ data: logs }, { data: clinics }] = await Promise.all([
      supabase
        .from("system_logs")
        .select("module, action, actor_user_id, actor_name")
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase.from("clinics").select("id, name").order("name"),
    ]);

    const modules = Array.from(
      new Set((logs ?? []).map((r) => r.module as string).filter(Boolean)),
    ).sort();
    const actions = Array.from(
      new Set((logs ?? []).map((r) => r.action as string).filter(Boolean)),
    ).sort();
    const actorsMap = new Map<string, string>();
    for (const r of logs ?? []) {
      const id = r.actor_user_id as string | null;
      if (id && !actorsMap.has(id)) {
        actorsMap.set(id, (r.actor_name as string | null) ?? "—");
      }
    }
    const actors = Array.from(actorsMap.entries()).map(([id, name]) => ({
      id,
      name,
    }));

    return {
      modules,
      actions,
      actors,
      clinics: (clinics ?? []).map((c) => ({
        id: c.id as string,
        name: (c.name as string | null) ?? "—",
      })),
    };
  } catch {
    return empty;
  }
}
