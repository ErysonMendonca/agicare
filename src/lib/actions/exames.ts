"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireClinico } from "@/lib/auth";
import { requireAction } from "@/lib/permissions";
import { getMyProfessionalId } from "@/lib/clinico/professional";
import { requireClinic } from "@/lib/tenant";
import { getAtendimentoAtivo } from "@/lib/data/atendimento";
import { logAccess } from "@/lib/audit";
import { enviarNotificacao } from "@/lib/integrations/notifications";

export type ActionState = { error?: string; ok?: boolean } | undefined;

const criarSchema = z.object({
  patientId: z.string().min(1, "Paciente inválido."),
  exam_name: z.string().trim().min(1, "Informe o exame."),
  tuss_code: z.string().trim().optional(),
  category: z.enum(["laboratorial", "imagem"]).default("laboratorial"),
  notes: z.string().trim().optional(),
  laterality: z.string().trim().optional(),
});

export type CriarPedidoExameInput = z.infer<typeof criarSchema>;

const statusSchema = z.object({
  id: z.string().min(1, "Pedido inválido."),
  status: z.enum(["solicitado", "concluido"]),
  patientId: z.string().min(1, "Paciente inválido."),
});

/** Cria um pedido de exame (status inicial 'solicitado'). */
export async function criarPedidoExame(
  input: CriarPedidoExameInput,
): Promise<ActionState> {
  const parsed = criarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };


  const guard = await requireClinico();
  if ("error" in guard) return { error: guard.error };

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const professionalId = await getMyProfessionalId(guard.userId);

  const d = parsed.data;
  // Vincula o pedido ao atendimento corrente do paciente (histórico por atendimento).
  const ativo = await getAtendimentoAtivo(d.patientId);
  const { error } = await supabase.from("exam_orders").insert({
    clinic_id: clinicId,
    patient_id: d.patientId,
    professional_id: professionalId,
    created_by: guard.userId,
    queue_entry_id: ativo?.queueEntryId ?? null,
    tuss_code: d.tuss_code || null,
    exam_name: d.exam_name,
    category: d.category,
    status: "solicitado",
    notes: d.notes || null,
    laterality: d.laterality && d.laterality !== "Não se aplica" ? d.laterality : null,
  });
  if (error) return { error: error.message };

  await logAccess({ patientId: d.patientId, module: "exames", action: "create" });

  revalidatePath(`/prontuario/${d.patientId}/exames`);
  revalidatePath(`/prontuario/${d.patientId}`);
  return { ok: true };
}

/** Alterna o status de um pedido de exame (solicitado ↔ concluido). */
export async function atualizarStatusExame(
  id: string,
  status: "solicitado" | "concluido",
  patientId: string,
): Promise<ActionState> {
  const parsed = statusSchema.safeParse({ id, status, patientId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };


  const guard = await requireClinico();
  if ("error" in guard) return { error: guard.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("exam_orders")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .eq("patient_id", parsed.data.patientId);
  if (error) return { error: error.message };

  await logAccess({
    patientId: parsed.data.patientId,
    module: "exames",
    action: "update",
  });

  revalidatePath(`/prontuario/${parsed.data.patientId}/exames`);
  revalidatePath(`/prontuario/${parsed.data.patientId}`);
  return { ok: true };
}

const editarSchema = z.object({
  id: z.string().min(1, "Pedido inválido."),
  patientId: z.string().min(1, "Paciente inválido."),
  exam_name: z.string().trim().min(1, "Informe o exame."),
  tuss_code: z.string().trim().optional(),
  category: z.enum(["laboratorial", "imagem"]),
  notes: z.string().trim().optional(),
  laterality: z.string().trim().optional(),
});

export type EditarPedidoExameInput = z.infer<typeof editarSchema>;

/**
 * Edita um pedido de exame já existente. Bloqueado se o pedido estiver
 * cancelado (read-only) e gateado por permissão de prontuário/edit.
 */
export async function editarExame(
  input: EditarPedidoExameInput,
): Promise<ActionState> {
  const parsed = editarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const guard = await requireClinico();
  if ("error" in guard) return { error: guard.error };

  const denied = await requireAction("prontuario", "edit");
  if (denied) return { error: denied };

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const d = parsed.data;

  // Não editar documento cancelado (read-only).
  const { data: atual, error: readErr } = await supabase
    .from("exam_orders")
    .select("cancelled_at")
    .eq("id", d.id)
    .eq("patient_id", d.patientId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!atual) return { error: "Exame não encontrado." };
  if (atual.cancelled_at) {
    return { error: "Este exame está cancelado e não pode ser editado." };
  }

  const { error } = await supabase
    .from("exam_orders")
    .update({
      exam_name: d.exam_name,
      tuss_code: d.tuss_code || null,
      category: d.category,
      notes: d.notes || null,
      laterality: d.laterality && d.laterality !== "Não se aplica" ? d.laterality : null,
    })
    .eq("id", d.id)
    .eq("patient_id", d.patientId)
    .eq("clinic_id", clinicId);
  if (error) return { error: error.message };

  await logAccess({ patientId: d.patientId, module: "exames", action: "update" });

  revalidatePath(`/prontuario/${d.patientId}/exames`);
  revalidatePath(`/prontuario/${d.patientId}`);
  return { ok: true };
}

const enviarResultadoSchema = z.object({
  examId: z.string().min(1, "Exame inválido."),
  patientId: z.string().min(1, "Paciente inválido."),
});

export type EnviarResultadoInput = z.infer<typeof enviarResultadoSchema>;

/**
 * Envia o RESULTADO de um exame CONCLUÍDO ao e-mail do paciente, reusando o
 * mesmo dispatcher (`enviarNotificacao` → Resend) do comprovante. Só canal
 * e-mail. Acesso clínico (LGPD) exigido; escopo de clínica pela RLS.
 */
export async function enviarResultadoExameEmail(
  input: EnviarResultadoInput,
): Promise<ActionState> {
  const parsed = enviarResultadoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };


  const guard = await requireClinico();
  if ("error" in guard) return { error: guard.error };

  const { examId, patientId } = parsed.data;
  const supabase = await createClient();

  // Exame (deve pertencer ao paciente e estar concluído).
  const { data: exame, error: exErr } = await supabase
    .from("exam_orders")
    .select("id, exam_name, notes, status")
    .eq("id", examId)
    .eq("patient_id", patientId)
    .maybeSingle();
  if (exErr) return { error: exErr.message };
  if (!exame) return { error: "Exame não encontrado." };
  if (exame.status !== "concluido") {
    return { error: "Só é possível enviar o resultado de exames concluídos." };
  }

  // E-mail do paciente (escopo de clínica via RLS).
  const { data: paciente, error: pacErr } = await supabase
    .from("patients")
    .select("full_name, email")
    .eq("id", patientId)
    .maybeSingle();
  if (pacErr) return { error: pacErr.message };
  const email = (paciente?.email as string | null)?.trim();
  if (!email) return { error: "Paciente sem e-mail cadastrado." };

  const res = await enviarNotificacao({
    canal: "email",
    destino: email,
    template: "resultado_exame",
    payload: {
      exame: (exame.exam_name as string | null) ?? "—",
      observacoes: (exame.notes as string | null) ?? "",
      paciente: (paciente?.full_name as string | null) ?? "",
    },
    patientId,
  });

  if (res.status === "erro") {
    return { error: res.error ?? "Falha ao enviar o resultado por e-mail." };
  }

  await logAccess({ patientId, module: "exames", action: "update" });
  return { ok: true };
}
