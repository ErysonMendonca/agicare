"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { requireClinico } from "@/lib/auth";
import { getMyProfessionalId } from "@/lib/clinico/professional";
import { getActiveClinicId, DEMO_CLINIC_ID } from "@/lib/tenant";

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

  // Modo demo: simula sucesso com um id representativo (sem persistir).
  if (isDemoMode()) {
    return { ok: true, orderId: `demo-prot-${Date.now()}`, clinicId: DEMO_CLINIC_ID };
  }

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

  const { data: order, error } = await supabase
    .from("prosthetic_orders")
    .insert({
      clinic_id: clinicId,
      patient_id: d.patientId,
      professional_id: professionalId,
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

  if (isDemoMode()) return { ok: true };

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
