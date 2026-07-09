import { requireView } from "@/lib/permissions";
import { getRole } from "@/lib/auth";
import { requireClinic } from "@/lib/tenant";
import {
  getSystemLogs,
  getSystemLogFilterOptions,
  type SystemLogFiltro,
} from "@/lib/data/system-logs";
import { LogsClient } from "./LogsClient";

/** Itens por página da trilha de auditoria (paginação server-side). */
const LIMIT = 50;

export default async function LogsPage({
  searchParams,
}: {
  // Next.js 16: searchParams é assíncrono.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Gate server-side pela matriz de permissões (admin sempre passa). Módulo
  // sensível: nenhum papel não-admin o recebe por default.
  await requireView("logs");

  const sp = await searchParams;
  const str = (v: string | string[] | undefined) =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;

  // Página atual (1-based) → offset. Nunca abaixo de 1.
  const page = Math.max(1, Number(str(sp.page)) || 1);
  const offset = (page - 1) * LIMIT;

  // ESCOPO DE CLÍNICA. `getSystemLogs` consulta com service-role (ignora RLS) e
  // `clinicId` é um filtro OPCIONAL: sem ele, a query varre todas as clínicas.
  // Enquanto a rota era admin-only isso passava; agora o módulo `logs` é
  // concedível a outros papéis, então o escopo NÃO pode vir do client. Só o
  // admin pode filtrar por outra clínica (ou ver todas); os demais ficam presos
  // à clínica ativa, vinda do servidor.
  const isAdmin = (await getRole()) === "admin";
  const clinicId = isAdmin ? str(sp.clinicId) : await requireClinic();

  // Filtros vindos da URL → afetam de verdade a consulta no servidor.
  const filtros: SystemLogFiltro = {
    q: str(sp.q),
    module: str(sp.module),
    action: str(sp.action),
    actorId: str(sp.actorId),
    clinicId,
    from: str(sp.from),
    to: str(sp.to),
  };

  const [{ rows, total }, options] = await Promise.all([
    getSystemLogs({ ...filtros, limit: LIMIT, offset }),
    getSystemLogFilterOptions(),
  ]);

  return (
    <LogsClient
      rows={rows}
      total={total}
      options={options}
      filtros={filtros}
      page={page}
      limit={LIMIT}
    />
  );
}
