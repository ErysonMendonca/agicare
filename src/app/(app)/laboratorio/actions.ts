"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { requireClinico } from "@/lib/auth";
import { type LabEtapa, type LabStatus } from "@/lib/data/lab";

export type ActionState = { error?: string; ok?: boolean } | undefined;

const moverEtapaSchema = z.object({
  id: z.string().min(1, "Caso inválido."),
  etapa: z.enum(["entrada", "processamento", "refinamento", "conclusao"]),
});

/**
 * Status do caso derivado da etapa do Kanban, para manter Badge/KPIs coerentes:
 *  entrada → pendente · processamento/refinamento → em andamento · conclusão → finalizado.
 */
const statusPorEtapa: Record<LabEtapa, LabStatus> = {
  entrada: "pendente",
  processamento: "em_andamento",
  refinamento: "em_andamento",
  conclusao: "finalizado",
};

/**
 * Move um caso do laboratório entre as etapas do Kanban, gravando a etapa
 * (coluna `stage`) e sincronizando o status do caso. RLS de staff protege
 * a escrita (lab_cases tem policy de staff).
 */
export async function moverEtapaLab(
  id: string,
  etapa: LabEtapa,
): Promise<ActionState> {
  const parsed = moverEtapaSchema.safeParse({ id, etapa });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  // Defesa em profundidade: além da RLS de staff em lab_cases, exige staff
  // clínico (admin/médico) para mover o caso entre etapas do Kanban.
  const auth = await requireClinico();
  if ("error" in auth) return { error: auth.error };

  if (isDemoMode()) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("lab_cases")
    .update({
      stage: parsed.data.etapa,
      status: statusPorEtapa[parsed.data.etapa],
    })
    .eq("id", parsed.data.id);

  if (error) return { error: error.message };

  revalidatePath("/laboratorio");
  return { ok: true };
}
