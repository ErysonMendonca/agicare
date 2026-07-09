"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireClinic } from "@/lib/tenant";
import { getCurrentUser, getRole } from "@/lib/auth";
import { listProcedimentosAtendimento } from "@/lib/data/atendimento";

export type ActionState = { error?: string; ok?: boolean } | undefined;

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
  const negado = await guardMedico();
  if (negado) return { error: negado };
  const clinicId = await requireClinic();
  const supabase = await createClient();

  // Só permite remover enquanto o atendimento está EM ANDAMENTO (após finalizar
  // não se altera o que foi cobrado).
  const { data: exec } = await supabase
    .from("procedure_executions")
    .select("id, queue_entries(status)")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!exec) return { error: "Procedimento não encontrado." };
  const qe = Array.isArray(exec.queue_entries)
    ? exec.queue_entries[0]
    : exec.queue_entries;
  if ((qe?.status as string | null) !== "em_atendimento") {
    return { error: "Só é possível remover procedimentos durante o atendimento." };
  }

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
    .select("patient_id, appointment_id");
  if (error) return { error: "Não foi possível finalizar o atendimento." };
  if (!data || data.length === 0) {
    return { error: "O atendimento não está em andamento." };
  }
  const patientId = (data[0]?.patient_id as string | null) ?? null;
  const appointmentId = (data[0]?.appointment_id as string | null) ?? null;

  // Verifica convênio do paciente para classificar o faturamento
  let kind = "particular";
  if (patientId) {
    const { data: pt } = await supabase
      .from("patients")
      .select("convenio")
      .eq("id", patientId)
      .maybeSingle();
    if (pt?.convenio && !/particular/i.test(pt.convenio)) {
      kind = "convenio";
    }
  }

  // Computa o total dos procedimentos registrados no atendimento
  const { total } = await listProcedimentosAtendimento(queueEntryId);

  // Apenas gera o evento faturável se for particular.
  // Para convênio, o fluxo será abordado depois, conforme solicitado.
  if (kind === "particular") {
    const { data: evt, error: evtErr } = await supabase
      .from("billable_events")
      .insert({
        clinic_id: clinicId,
        patient_id: patientId,
        appointment_id: appointmentId,
        service: "Atendimento",
        amount: total,
        status: "pendente",
        kind: "particular",
      })
      .select("id")
      .single();
    if (evtErr || !evt) {
      console.error("Erro ao gerar evento de faturamento:", evtErr);
      // O atendimento finaliza, mas talvez a recepção precise adicionar manualmente se der erro?
    } else {
      // Vincula TODOS os procedimentos lançados no atendimento a este evento,
      // para o check-out itemizá-los e cobrá-los na saída (billable_event_id).
      const { error: linkErr } = await supabase
        .from("procedure_executions")
        .update({ billable_event_id: evt.id })
        .eq("queue_entry_id", queueEntryId)
        .eq("clinic_id", clinicId);
      if (linkErr) {
        console.error("Erro ao vincular procedimentos ao faturamento:", linkErr);
      }
    }
  }

  revalidar(patientId ?? undefined);
  return { ok: true };
}
