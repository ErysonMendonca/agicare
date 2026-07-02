"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { requireClinic } from "@/lib/tenant";
import { getCurrentUser, getRole } from "@/lib/auth";
import {
  listProcedimentosAtendimento,
  type ProcedimentoExecutado,
} from "@/lib/data/atendimento";

export type ActionState = { error?: string; ok?: boolean } | undefined;

/** Recepção carrega os procedimentos + total de um atendimento p/ o fechamento. */
export async function carregarFechamento(queueEntryId: string): Promise<{
  itens: ProcedimentoExecutado[];
  total: number;
  totalLabel: string;
  error?: string;
}> {
  const vazio = { itens: [], total: 0, totalLabel: "R$ 0,00" };
  if (!z.string().uuid().safeParse(queueEntryId).success) {
    return { ...vazio, error: "Atendimento inválido." };
  }
  const role = await getRole();
  if (role !== "recepcao" && role !== "admin") {
    return { ...vazio, error: "Acesso negado." };
  }
  return listProcedimentosAtendimento(queueEntryId);
}

function revalidar(patientId?: string) {
  revalidatePath("/fila");
  if (patientId) revalidatePath(`/prontuario/${patientId}`);
}

const uuid = z.string().uuid("Registro inválido.");

/** Papel clínico (médico/admin) pode registrar procedimentos e finalizar. */
async function guardMedico(): Promise<string | null> {
  const role = await getRole();
  if (role !== "medico" && role !== "admin") {
    return "Apenas o médico pode registrar/finalizar o atendimento.";
  }
  return null;
}

// ── Médico: registrar procedimento realizado no atendimento ──────────
export async function registrarProcedimento(input: {
  queueEntryId: string;
  procedureId: string;
}): Promise<ActionState> {
  const parsed = z
    .object({ queueEntryId: uuid, procedureId: uuid })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (isDemoMode()) return { ok: true };
  const negado = await guardMedico();
  if (negado) return { error: negado };

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const me = await getCurrentUser();

  // Preço do catálogo (snapshot) + paciente da entrada — escopados por clínica.
  const [{ data: proc }, { data: entry }] = await Promise.all([
    supabase
      .from("procedures")
      .select("id, price")
      .eq("id", parsed.data.procedureId)
      .eq("clinic_id", clinicId)
      .maybeSingle(),
    supabase
      .from("queue_entries")
      .select("id, patient_id, status")
      .eq("id", parsed.data.queueEntryId)
      .eq("clinic_id", clinicId)
      .maybeSingle(),
  ]);
  if (!proc) return { error: "Procedimento não encontrado." };
  if (!entry) return { error: "Atendimento não encontrado." };
  if (entry.status !== "em_atendimento") {
    return { error: "Só é possível registrar procedimentos durante o atendimento." };
  }

  const { error } = await supabase.from("procedure_executions").insert({
    clinic_id: clinicId,
    queue_entry_id: parsed.data.queueEntryId,
    procedure_id: parsed.data.procedureId,
    patient_id: (entry.patient_id as string | null) ?? null,
    executed_by: me?.userId ?? null,
    amount: Number(proc.price ?? 0),
  });
  if (error) return { error: "Não foi possível registrar o procedimento." };

  revalidar((entry.patient_id as string | null) ?? undefined);
  return { ok: true };
}

/** Médico: remove um procedimento registrado (antes de finalizar). */
export async function removerProcedimento(id: string): Promise<ActionState> {
  if (!uuid.safeParse(id).success) return { error: "Registro inválido." };
  if (isDemoMode()) return { ok: true };
  const negado = await guardMedico();
  if (negado) return { error: negado };
  const clinicId = await requireClinic();
  const supabase = await createClient();
  const { error } = await supabase
    .from("procedure_executions")
    .delete()
    .eq("id", id)
    .eq("clinic_id", clinicId);
  if (error) return { error: "Não foi possível remover o procedimento." };
  revalidar();
  return { ok: true };
}

/** Médico: finaliza o atendimento clínico → aguardando_pagamento (recepção fecha). */
export async function finalizarAtendimento(
  queueEntryId: string,
): Promise<ActionState> {
  if (!uuid.safeParse(queueEntryId).success) return { error: "Atendimento inválido." };
  if (isDemoMode()) return { ok: true };
  const negado = await guardMedico();
  if (negado) return { error: negado };
  const clinicId = await requireClinic();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("queue_entries")
    .update({ status: "aguardando_pagamento" })
    .eq("id", queueEntryId)
    .eq("clinic_id", clinicId)
    .eq("status", "em_atendimento")
    .select("patient_id");
  if (error) return { error: "Não foi possível finalizar o atendimento." };
  if (!data || data.length === 0) {
    return { error: "O atendimento não está em andamento." };
  }
  revalidar((data[0]?.patient_id as string | null) ?? undefined);
  return { ok: true };
}

// ── Recepção: fechamento (recebe o pagamento e finaliza) ─────────────
const METODOS = ["dinheiro", "pix", "cartao", "boleto", "convenio"] as const;
const fecharSchema = z.object({
  queueEntryId: uuid,
  method: z.enum(METODOS),
  amount: z.number().nonnegative("Valor inválido."),
});
export type FecharInput = z.input<typeof fecharSchema>;

/** Recepção/admin: registra o pagamento e finaliza o atendimento. */
export async function fecharAtendimento(input: FecharInput): Promise<ActionState> {
  const parsed = fecharSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (isDemoMode()) return { ok: true };

  const role = await getRole();
  if (role !== "recepcao" && role !== "admin") {
    return { error: "Apenas a recepção pode fechar o atendimento." };
  }
  const clinicId = await requireClinic();
  const supabase = await createClient();
  const me = await getCurrentUser();

  // Confere a entrada (deve estar aguardando pagamento) e pega o paciente.
  const { data: entry } = await supabase
    .from("queue_entries")
    .select("id, patient_id, status")
    .eq("id", parsed.data.queueEntryId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!entry) return { error: "Atendimento não encontrado." };
  if (entry.status !== "aguardando_pagamento") {
    return { error: "O atendimento não está aguardando pagamento." };
  }

  // Evento faturável + pagamento (integra com o Faturamento). event_id liga os dois.
  const year = new Date().getFullYear();
  const code = `EVT-${year}-${Date.now().toString().slice(-6)}`;
  const { data: evt, error: evtErr } = await supabase
    .from("billable_events")
    .insert({
      clinic_id: clinicId,
      code,
      patient_id: (entry.patient_id as string | null) ?? null,
      service: "Atendimento",
      amount: parsed.data.amount,
      status: "faturado",
    })
    .select("id")
    .single();
  if (evtErr || !evt) return { error: "Não foi possível registrar o faturamento." };

  if (parsed.data.amount > 0) {
    const { error: payErr } = await supabase.from("payments").insert({
      clinic_id: clinicId,
      event_id: evt.id,
      method: parsed.data.method,
      amount: parsed.data.amount,
      status: "confirmado",
      provider: "manual",
      created_by: me?.userId ?? null,
      confirmed_at: new Date().toISOString(),
    });
    if (payErr) return { error: "Não foi possível registrar o pagamento." };
  }

  // Finaliza a entrada da fila.
  const { error: updErr } = await supabase
    .from("queue_entries")
    .update({ status: "finalizado" })
    .eq("id", parsed.data.queueEntryId)
    .eq("clinic_id", clinicId)
    .eq("status", "aguardando_pagamento");
  if (updErr) return { error: "Não foi possível finalizar o atendimento." };

  revalidar((entry.patient_id as string | null) ?? undefined);
  return { ok: true };
}
