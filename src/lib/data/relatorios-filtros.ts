import type { createClient } from "@/lib/supabase/server";

// ════════════════════════════════════════════════════════════════
// Filtros de Relatórios & BI (escopo 14) — base compartilhada por
// data/relatorios.ts e data/bi.ts. Tudo server-only.
//
// Os filtros chegam pela URL (searchParams) e afetam DE VERDADE as
// consultas no servidor:
//   • De/Até        → janela mensal dos buckets + recorte por data nas
//                      agregações (gte/lt em starts_at/created_at).
//   • Especialidade → resolvida para os professional_id da especialidade.
//   • Profissional  → professional_id específico.
//
// Especialidade/Profissional restringem as métricas ancoradas em um
// profissional (agendamentos, faturamento, fila). Métricas sem vínculo
// direto (novos pacientes, origem, catálogo de procedimentos) respeitam
// apenas o período — documentado em cada ponto de uso.
// ════════════════════════════════════════════════════════════════

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type RelatoriosFiltros = {
  /** Início do período (yyyy-mm-dd) — inclusivo. */
  de?: string;
  /** Fim do período (yyyy-mm-dd) — inclusivo (até o fim do dia). */
  ate?: string;
  /** Especialidade exata (professionals.specialty). Vazio = todas. */
  especialidade?: string;
  /** professionals.id. Vazio = todos. */
  profissionalId?: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normaliza filtros crus (searchParams) num objeto seguro: descarta datas
 * mal formadas, ids não-UUID e os sentinelas "todas"/"todos" da UI.
 */
export function parseRelatoriosFiltros(
  raw: Record<string, string | string[] | undefined>,
): RelatoriosFiltros {
  const one = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  const de = one(raw.de);
  const ate = one(raw.ate);
  const esp = one(raw.especialidade)?.trim();
  const pid = one(raw.profissionalId)?.trim();
  return {
    de: de && ISO_DATE.test(de) ? de : undefined,
    ate: ate && ISO_DATE.test(ate) ? ate : undefined,
    especialidade: esp && esp !== "todas" ? esp : undefined,
    profissionalId: pid && pid !== "todos" && UUID.test(pid) ? pid : undefined,
  };
}

// ── Buckets mensais ────────────────────────────────────────────────
export type Bucket = { label: string; start: Date; end: Date };

const MES_NOMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

/** Janela dos últimos `n` meses (inclui o mês corrente), do mais antigo ao atual. */
export function lastMonths(n: number): Bucket[] {
  const out: Bucket[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    out.push({ label: MES_NOMES[start.getMonth()], start, end });
  }
  return out;
}

/**
 * Buckets mensais conforme os filtros: se houver período válido (de ≤ ate),
 * cobre do mês de `de` ao mês de `ate` (clamp de 36 meses); senão cai na
 * janela padrão (`fallbackN` meses).
 */
export function buildBuckets(
  filtros: RelatoriosFiltros,
  fallbackN = 7,
): Bucket[] {
  const de = filtros.de ? new Date(`${filtros.de}T00:00:00`) : null;
  const ate = filtros.ate ? new Date(`${filtros.ate}T00:00:00`) : null;
  if (
    !de ||
    !ate ||
    Number.isNaN(de.getTime()) ||
    Number.isNaN(ate.getTime()) ||
    ate < de
  ) {
    return lastMonths(fallbackN);
  }

  const out: Bucket[] = [];
  let y = de.getFullYear();
  let m = de.getMonth();
  const endY = ate.getFullYear();
  const endM = ate.getMonth();
  let guard = 0;
  while ((y < endY || (y === endY && m <= endM)) && guard < 36) {
    out.push({
      label: MES_NOMES[m],
      start: new Date(y, m, 1),
      end: new Date(y, m + 1, 1),
    });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    guard += 1;
  }
  return out.length ? out : lastMonths(fallbackN);
}

/** Índice do mês ao qual a data pertence dentro da janela, ou -1 se fora. */
export function bucketOf(buckets: Bucket[], iso: string | null): number {
  if (!iso) return -1;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return -1;
  for (let i = 0; i < buckets.length; i++) {
    if (t >= buckets[i].start.getTime() && t < buckets[i].end.getTime()) {
      return i;
    }
  }
  return -1;
}

/** ISO do início (1ª data) e do fim (exclusivo) cobertos pelos buckets. */
export function bucketWindow(buckets: Bucket[]): { startIso: string; endIso: string } {
  return {
    startIso: buckets[0].start.toISOString(),
    endIso: buckets[buckets.length - 1].end.toISOString(),
  };
}

/**
 * Janela de datas EXPLÍCITA (só quando o usuário informa de+ate válidos).
 * Usada por métricas que, sem filtro, agregam todo o histórico (origem,
 * epidemiológico). `endIso` é exclusivo (fim do dia de `ate`).
 */
export function dateWindow(
  filtros: RelatoriosFiltros,
): { startIso: string; endIso: string } | null {
  if (!filtros.de || !filtros.ate) return null;
  const start = new Date(`${filtros.de}T00:00:00`);
  const end = new Date(`${filtros.ate}T00:00:00`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  ) {
    return null;
  }
  const endIncl = new Date(end);
  endIncl.setDate(endIncl.getDate() + 1); // fim inclusivo → +1 dia
  return { startIso: start.toISOString(), endIso: endIncl.toISOString() };
}

/**
 * Resolve os professional_id que casam com os filtros de especialidade/
 * profissional. Retorna:
 *   - `null`  → sem filtro por profissional (não restringir a consulta);
 *   - `[]`    → filtro ativo, mas nenhum profissional casa (resultado vazio);
 *   - `[...]` → ids a aplicar via `.in("professional_id", ids)`.
 *
 * Em falha de leitura degrada para `null` (best-effort, não derruba a tela).
 */
export async function professionalScope(
  supabase: ServerClient,
  filtros: RelatoriosFiltros,
): Promise<string[] | null> {
  const esp = filtros.especialidade;
  const pid = filtros.profissionalId;
  if (!esp && !pid) return null;

  let q = supabase.from("professionals").select("id");
  if (pid) q = q.eq("id", pid);
  if (esp) q = q.eq("specialty", esp);

  const { data, error } = await q;
  if (error) return null;
  return (data ?? []).map((r) => r.id as string);
}
