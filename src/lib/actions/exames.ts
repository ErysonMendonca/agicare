"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { requireClinico } from "@/lib/auth";
import { getMyProfessionalId } from "@/lib/clinico/professional";
import { requireClinic } from "@/lib/tenant";
import { logAccess } from "@/lib/audit";

export type ActionState = { error?: string; ok?: boolean } | undefined;

const criarSchema = z.object({
  patientId: z.string().min(1, "Paciente inválido."),
  exam_name: z.string().trim().min(1, "Informe o exame."),
  tuss_code: z.string().trim().optional(),
  category: z.enum(["laboratorial", "imagem"]).default("laboratorial"),
  notes: z.string().trim().optional(),
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

  if (isDemoMode()) return { ok: true };

  const guard = await requireClinico();
  if ("error" in guard) return { error: guard.error };

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const professionalId = await getMyProfessionalId(guard.userId);

  const d = parsed.data;
  const { error } = await supabase.from("exam_orders").insert({
    clinic_id: clinicId,
    patient_id: d.patientId,
    professional_id: professionalId,
    tuss_code: d.tuss_code || null,
    exam_name: d.exam_name,
    category: d.category,
    status: "solicitado",
    notes: d.notes || null,
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

  if (isDemoMode()) return { ok: true };

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
