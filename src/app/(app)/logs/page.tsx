import { requireRole } from "@/lib/auth";
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
  // Gate server-side: somente admin acessa o Log do Sistema (visão global).
  await requireRole("admin");

  const sp = await searchParams;
  const str = (v: string | string[] | undefined) =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;

  // Página atual (1-based) → offset. Nunca abaixo de 1.
  const page = Math.max(1, Number(str(sp.page)) || 1);
  const offset = (page - 1) * LIMIT;

  // Filtros vindos da URL → afetam de verdade a consulta no servidor.
  const filtros: SystemLogFiltro = {
    q: str(sp.q),
    module: str(sp.module),
    action: str(sp.action),
    actorId: str(sp.actorId),
    clinicId: str(sp.clinicId),
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
