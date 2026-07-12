"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireClinico } from "@/lib/auth";
import { requireAction } from "@/lib/permissions";
import { getMyProfessionalId } from "@/lib/clinico/professional";
import { getActiveClinicId, requireClinic, DEMO_CLINIC_ID } from "@/lib/tenant";
import { getAtendimentoAtivo } from "@/lib/data/atendimento";

export type ActionState = { error?: string; ok?: boolean } | undefined;

/** Data ISO (yyyy-mm-dd) de hoje + n dias — usada como prazo do pedido. */
function prazoEmDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

const pedidoSchema = z.object({
  patientId: z.string().min(1, "Paciente inválido."),
  teeth: z.string().trim().min(1, "Informe os dentes do trabalho."),
  workType: z.string().trim().min(1, "Selecione o tipo de trabalho."),
  urgent: z.boolean().default(false),
  material: z.string().trim().optional(),
  color: z.string().trim().optional(),
  finishLine: z.string().trim().optional(),
  occlusion: z.string().trim().optional(),
  clinicalNotes: z.string().trim().optional(),
});

export type PedidoProteticoInput = z.infer<typeof pedidoSchema>;

/**
 * Cria um pedido de trabalho protético e retorna o id gerado (necessário para
 * o upload dos anexos no cliente). O prazo (due_date) deriva de `urgent`:
 * urgente = hoje + 5 dias; padrão = hoje + 10 dias.
 */
export async function criarPedidoProtetico(
  input: PedidoProteticoInput,
): Promise<{ ok?: boolean; error?: string; orderId?: string; clinicId?: string }> {
  const parsed = pedidoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const d = parsed.data;
  const dueDate = prazoEmDias(d.urgent ? 5 : 10);



  const guard = await requireClinico();
  if ("error" in guard) return { error: guard.error };

  // clinic_id da clínica ativa: vai no insert (RLS exige) E é devolvido ao client
  // para montar o path de upload no layout exigido pela 0021:
  // protetico/<clinic_id>/<patient_id>/<order_id>/<arquivo>.
  const clinicId = await getActiveClinicId();
  if (!clinicId) {
    return { error: "Nenhuma clínica ativa selecionada." };
  }

  const supabase = await createClient();
  const professionalId = await getMyProfessionalId(guard.userId);

  // Vincula o pedido ao atendimento corrente do paciente (histórico por atendimento).
  const ativo = await getAtendimentoAtivo(d.patientId);
  const { data: order, error } = await supabase
    .from("prosthetic_orders")
    .insert({
      clinic_id: clinicId,
      patient_id: d.patientId,
      professional_id: professionalId,
      created_by: guard.userId,
      queue_entry_id: ativo?.queueEntryId ?? null,
      teeth: d.teeth,
      work_type: d.workType,
      urgent: d.urgent,
      due_date: dueDate,
      material: d.material || null,
      color: d.color || null,
      finish_line: d.finishLine || null,
      occlusion: d.occlusion || null,
      clinical_notes: d.clinicalNotes || null,
      status: "aberto",
    })
    .select("id")
    .single();
  if (error || !order) {
    return { error: error?.message ?? "Falha ao criar o pedido protético." };
  }

  revalidatePath(`/prontuario/${d.patientId}/protetico`);
  return { ok: true, orderId: order.id as string, clinicId };
}

const arquivoSchema = z.object({
  orderId: z.string().min(1, "Pedido inválido."),
  patientId: z.string().min(1, "Paciente inválido."),
  fileName: z.string().trim().min(1, "Arquivo inválido."),
  storagePath: z.string().trim().min(1, "Caminho do arquivo inválido."),
  kind: z.enum(["scan", "foto", "radiografia", "mordida"]),
  sizeBytes: z.number().int().nonnegative().optional(),
});

export type ArquivoProteticoInput = z.infer<typeof arquivoSchema>;

/**
 * Registra os metadados de um arquivo já enviado ao bucket 'protetico'.
 * O upload binário em si acontece no cliente (browser → Storage); aqui só
 * gravamos a referência (storage_path) em prosthetic_files.
 */
export async function registrarArquivoProtetico(
  input: ArquivoProteticoInput,
): Promise<ActionState> {
  const parsed = arquivoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const d = parsed.data;


  const guard = await requireClinico();
  if ("error" in guard) return { error: guard.error };

  const clinicId = await getActiveClinicId();
  if (!clinicId) return { error: "Nenhuma clínica ativa selecionada." };

  const supabase = await createClient();
  const { error } = await supabase.from("prosthetic_files").insert({
    clinic_id: clinicId,
    order_id: d.orderId,
    file_name: d.fileName,
    storage_path: d.storagePath,
    kind: d.kind,
    size_bytes: d.sizeBytes ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/prontuario/${d.patientId}/protetico`);
  return { ok: true };
}

const editarSchema = z.object({
  orderId: z.string().uuid("Pedido inválido."),
  patientId: z.string().min(1, "Paciente inválido."),
  teeth: z.string().trim().min(1, "Informe os dentes do trabalho."),
  workType: z.string().trim().min(1, "Selecione o tipo de trabalho."),
  urgent: z.boolean().default(false),
  material: z.string().trim().optional(),
  color: z.string().trim().optional(),
  finishLine: z.string().trim().optional(),
  occlusion: z.string().trim().optional(),
  clinicalNotes: z.string().trim().optional(),
});

export type EditarPedidoProteticoInput = z.infer<typeof editarSchema>;

/**
 * Edita os campos de um pedido protético existente. Autorização: permissão de
 * módulo `prontuario` / ação `edit`. O update é filtrado por clinic_id
 * (multitenant, além da RLS) e recusa pedidos já cancelados (`cancelled_at`
 * not null → read-only).
 */
export async function editarPedidoProtetico(
  input: EditarPedidoProteticoInput,
): Promise<ActionState> {
  const parsed = editarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const denied = await requireAction("prontuario", "edit");
  if (denied) return { error: denied };

  const clinicId = await requireClinic();
  const d = parsed.data;

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("prosthetic_orders")
    .update({
      teeth: d.teeth,
      work_type: d.workType,
      urgent: d.urgent,
      material: d.material || null,
      color: d.color || null,
      finish_line: d.finishLine || null,
      occlusion: d.occlusion || null,
      clinical_notes: d.clinicalNotes || null,
    })
    .eq("id", d.orderId)
    .eq("clinic_id", clinicId)
    .is("cancelled_at", null)
    .select("id");
  if (error) {
    return { error: "Não foi possível salvar as alterações do pedido." };
  }
  if (!updated || updated.length === 0) {
    return { error: "Pedido não encontrado ou já cancelado." };
  }

  revalidatePath(`/prontuario/${d.patientId}/protetico`);
  return { ok: true };
}
