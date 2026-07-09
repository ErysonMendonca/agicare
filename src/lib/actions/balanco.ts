"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireClinic } from "@/lib/tenant";

// ════════════════════════════════════════════════════════════════
// Balanço Hídrico — abertura de ciclo (24h).
//
// Lacuna fechada: nenhuma ação ABRIA um ciclo (insert em fluid_balance),
// então a aba ficava sempre vazia. Os lançamentos (registrarLancamentoHidrico)
// e o fechamento (fecharBalancoHidrico) já existiam em actions/enfermagem.ts,
// mas dependiam de um ciclo aberto. Esta action cria o ciclo.
//
// Segue o padrão das actions de enfermagem (mesma família fluid_balance):
// isDemoMode → ok; createClient; clinic_id explícito (igual a
// registrarLancamentoHidrico); revalidatePath. O client chama e router.refresh.
// ════════════════════════════════════════════════════════════════

export type ActionState = { error?: string; ok?: boolean } | undefined;

const schema = z.object({
  patient_id: z.string().min(1, "Selecione o paciente."),
});

/**
 * Abre um novo ciclo de balanço hídrico (24h) para o paciente.
 * cycle_start = agora; closed = false. Os lançamentos passam a se vincular a
 * este ciclo (o data layer pega o ciclo mais recente).
 */
export async function abrirCicloBalanco(
  input: z.input<typeof schema>,
): Promise<ActionState> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const { error } = await supabase.from("fluid_balance").insert({
    clinic_id: clinicId,
    patient_id: parsed.data.patient_id,
    cycle_start: new Date().toISOString(),
    closed: false,
  });
  if (error) return { error: error.message };

  revalidatePath("/prontuario", "layout");
  return { ok: true };
}
