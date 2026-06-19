/**
 * Motor de fluxo de atendimento — PARTE PURA (sem next/headers / sem Supabase).
 *
 * Pode ser importada tanto por Server Components/Actions quanto por Client
 * Components (a UI da Fila decide quais botões mostrar por entrada). Nada aqui
 * toca em cookies, banco ou ambiente de servidor.
 *
 * ── Modelo ────────────────────────────────────────────────────────────
 * A fila progride por ETAPAS (`FlowStage`) na ORDEM CANÔNICA
 * `recepcao → triagem → atendimento`. A clínica configura QUAIS etapas existem
 * (em `clinic_settings.attendance_flow.stages`); `recepcao` e `atendimento` são
 * obrigatórias, `triagem` é opcional (sem ela, o paciente vai da recepção direto
 * ao atendimento).
 *
 * Cada etapa é representada na fila por um ou mais STATUS de `queue_entries`:
 *   recepcao    → ['aguardando']
 *   triagem     → ['triagem']
 *   atendimento → ['chamado', 'em_atendimento']
 * e o pipeline termina em 'finalizado'.
 *
 * Concluir uma etapa AVANÇA o status para o próximo do pipeline; após a última
 * etapa o status vira 'finalizado'. As ações disponíveis para uma entrada saem
 * de `actionsForEntry()` (ex.: chamar / triar / atender / finalizar).
 */

export type FlowStage = "recepcao" | "triagem" | "atendimento";

/** Status crus de `queue_entries` relevantes ao fluxo. */
export type QueueStatus =
  | "agendado"
  | "aguardando"
  | "triagem"
  | "chamado"
  | "em_atendimento"
  | "finalizado"
  | "desistencia";

/** Ações que a UI pode oferecer para uma entrada, conforme a etapa pendente. */
export type FlowAction = "chamar" | "triar" | "atender" | "finalizar";

/** Ordem CANÔNICA das etapas (fonte da verdade para ordenar qualquer subset). */
export const ALL_STAGES: readonly FlowStage[] = [
  "recepcao",
  "triagem",
  "atendimento",
] as const;

/** Fluxo padrão (fallback): recepção → triagem → atendimento. */
export const DEFAULT_STAGES: FlowStage[] = ["recepcao", "triagem", "atendimento"];

/** Etapas obrigatórias (não podem ser removidas pela configuração). */
export const REQUIRED_STAGES: readonly FlowStage[] = ["recepcao", "atendimento"];

/** Status que representam cada etapa, na ordem interna. */
const STAGE_STATUSES: Record<FlowStage, QueueStatus[]> = {
  recepcao: ["aguardando"],
  triagem: ["triagem"],
  atendimento: ["chamado", "em_atendimento"],
};

/** Status terminais: a entrada saiu do fluxo, sem ação possível. */
const TERMINAL: ReadonlySet<QueueStatus> = new Set([
  "finalizado",
  "desistencia",
]);

/**
 * Sanitiza/normaliza uma lista de etapas vinda de configuração/entrada:
 * mantém só valores conhecidos, remove duplicatas, reordena pela ordem canônica
 * e força as etapas obrigatórias. Sempre retorna um fluxo válido.
 */
export function sanitizeStages(input: unknown): FlowStage[] {
  const raw = Array.isArray(input) ? input : [];
  const set = new Set<FlowStage>();
  for (const v of raw) {
    if (v === "recepcao" || v === "triagem" || v === "atendimento") set.add(v);
  }
  for (const r of REQUIRED_STAGES) set.add(r);
  return ALL_STAGES.filter((s) => set.has(s));
}

/**
 * Pipeline de STATUS na ordem do fluxo, terminando em 'finalizado'.
 * Ex. (padrão): aguardando → triagem → chamado → em_atendimento → finalizado.
 * Sem triagem: aguardando → chamado → em_atendimento → finalizado.
 */
export function statusPipeline(stages: FlowStage[]): QueueStatus[] {
  const ordered = sanitizeStages(stages);
  const seq: QueueStatus[] = [];
  for (const st of ordered) seq.push(...STAGE_STATUSES[st]);
  seq.push("finalizado");
  return seq;
}

/** Próximo STATUS do pipeline após `current`, ou null se terminal/desconhecido. */
export function nextStatus(
  current: string,
  stages: FlowStage[],
): QueueStatus | null {
  const seq = statusPipeline(stages);
  const i = seq.indexOf(current as QueueStatus);
  if (i === -1 || i >= seq.length - 1) return null;
  return seq[i + 1];
}

/** A qual etapa o `status` pertence (null para terminais/agendado/desconhecido). */
export function stageForStatus(status: string): FlowStage | null {
  for (const stage of ALL_STAGES) {
    if (STAGE_STATUSES[stage].includes(status as QueueStatus)) return stage;
  }
  return null;
}

/**
 * STATUS para o qual a entrada deve ir AO CONCLUIR a etapa `stage`, considerando
 * o fluxo configurado. Usado pelas actions ao finalizar uma etapa (ex.: gravar a
 * triagem → avançar a fila). A `triagem` é incluída no pipeline mesmo que não
 * esteja configurada (uma triagem registrada manualmente ainda avança a fila).
 */
export function statusAfterStage(
  stage: FlowStage,
  stages: FlowStage[],
): QueueStatus {
  const withStage = sanitizeStages([...stages, stage]);
  const seq = statusPipeline(withStage);
  const lastStatus = STAGE_STATUSES[stage][STAGE_STATUSES[stage].length - 1];
  const i = seq.indexOf(lastStatus);
  if (i === -1 || i >= seq.length - 1) return "finalizado";
  return seq[i + 1];
}

/**
 * Ações disponíveis para uma entrada dado seu status atual e o fluxo configurado.
 * Mapeia o "próximo status pendente" para o verbo de ação:
 *   → 'triagem'        ⇒ ['triar']
 *   → 'chamado'        ⇒ ['chamar']
 *   → 'em_atendimento' ⇒ ['atender']
 *   → 'finalizado'     ⇒ ['finalizar']
 * Entradas terminais (finalizado/desistencia) ou ainda agendadas → [].
 */
export function actionsForEntry(
  statusRaw: string,
  stages: FlowStage[],
): FlowAction[] {
  if (statusRaw === "agendado" || TERMINAL.has(statusRaw as QueueStatus)) {
    return [];
  }
  const next = nextStatus(statusRaw, stages);
  switch (next) {
    case "triagem":
      return ["triar"];
    case "chamado":
      return ["chamar"];
    case "em_atendimento":
      return ["atender"];
    case "finalizado":
      return ["finalizar"];
    default:
      return [];
  }
}

/** A clínica usa triagem no fluxo? */
export function hasTriagem(stages: FlowStage[]): boolean {
  return sanitizeStages(stages).includes("triagem");
}
