import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_STAGES,
  sanitizeStages,
  type FlowStage,
} from "@/lib/data/attendance-flow.shared";

export * from "@/lib/data/attendance-flow.shared";

/**
 * Lê o fluxo de atendimento configurado da clínica
 * (`clinic_settings.attendance_flow.stages`). Fallback ao fluxo padrão
 * (`['recepcao','triagem','atendimento']`) em modo demo, sem dados, coluna
 * ausente (pré-0053) ou config inválida. `cache()` deduplica por request.
 *
 * Segue o mesmo padrão de leitura de `getSettings`: linha única da clínica
 * (RLS por clinic_id é a 2ª camada).
 */
export const getAttendanceFlow = cache(async (): Promise<FlowStage[]> => {

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clinic_settings")
      .select("attendance_flow")
      .limit(1)
      .maybeSingle();

    if (error || !data?.attendance_flow) return DEFAULT_STAGES;

    const raw = data.attendance_flow as { stages?: unknown } | null;
    const stages = sanitizeStages(raw?.stages);
    // sanitizeStages sempre garante recepcao+atendimento; se vier vazio/sujo,
    // o resultado já é um fluxo válido (no mínimo recepção + atendimento).
    return stages.length > 0 ? stages : DEFAULT_STAGES;
  } catch {
    return DEFAULT_STAGES;
  }
});
