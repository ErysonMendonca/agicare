"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { getCurrentUser, getRole } from "@/lib/auth";
import { getMyProfessionalId } from "@/lib/clinico/professional";
import { requireClinic } from "@/lib/tenant";
import { getPatientEditavel } from "@/lib/data/patients";
import { logAction } from "@/lib/system-log";

export type ActionState = { error?: string; ok?: boolean } | undefined;

/** Autorização: emitir receituário é ato do médico (admin como gestor). */
async function guardMedico(): Promise<string | null> {
  const role = await getRole();
  if (role !== "medico" && role !== "admin") {
    return "Apenas o médico pode emitir receituários.";
  }
  return null;
}

const receituarioSchema = z.object({
  patientId: z.string().uuid("Paciente inválido."),
  tipo: z.enum(["simples", "especial"]),
  texto: z.string().trim().min(1, "Informe o conteúdo do receituário."),
});

export type ReceituarioInput = z.infer<typeof receituarioSchema>;

/** Emite um receituário (simples ou especial), persistido em certificates. */
export async function emitirReceituario(
  input: ReceituarioInput,
): Promise<ActionState> {
  const parsed = receituarioSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  if (isDemoMode()) return { ok: true };

  const negado = await guardMedico();
  if (negado) return { error: negado };

  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };

  const supabase = await createClient();
  const professionalId = await getMyProfessionalId(current.userId);
  if (!professionalId)
    return { error: "Profissional não encontrado para o usuário atual." };

  const clinicId = await requireClinic();
  const d = parsed.data;

  // Integridade: o paciente precisa existir na clínica ativa (getPatientEditavel
  // já filtra por clinic_id). Evita anexar receituário a paciente de outra clínica.
  const paciente = await getPatientEditavel(d.patientId);
  if (!paciente) return { error: "Paciente não encontrado nesta clínica." };

  const { data: inserted, error } = await supabase
    .from("certificates")
    .insert({
      clinic_id: clinicId,
      patient_id: d.patientId,
      professional_id: professionalId,
      kind: `receituario_${d.tipo}`,
      prescription_text: d.texto,
    })
    .select("id")
    .single();
  if (error) {
    console.error("emitirReceituario insert falhou:", error);
    return { error: "Não foi possível emitir o receituário." };
  }

  await logAction({
    action: "create",
    module: "documentos",
    summary: `Emitiu um receituário ${d.tipo === "especial" ? "especial" : "simples"}`,
    entity: "certificate",
    entityId: inserted?.id ?? d.patientId,
  });
  revalidatePath(`/prontuario/${d.patientId}/receituario`);
  return { ok: true };
}

const removerSchema = z.object({
  id: z.string().uuid("Receituário inválido."),
});

/** Remove um receituário (escopo da clínica, apenas kind receituario_*). */
export async function removerReceituario(id: string): Promise<ActionState> {
  const parsed = removerSchema.safeParse({ id });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  if (isDemoMode()) return { ok: true };

  const negado = await guardMedico();
  if (negado) return { error: negado };

  const supabase = await createClient();
  const clinicId = await requireClinic();
  const { data: removed, error } = await supabase
    .from("certificates")
    .delete()
    .eq("id", parsed.data.id)
    .eq("clinic_id", clinicId)
    .like("kind", "receituario_%")
    .select("patient_id");
  if (error) {
    console.error("removerReceituario delete falhou:", error);
    return { error: "Não foi possível remover o receituário." };
  }
  if (!removed || removed.length === 0) {
    return { error: "Receituário não encontrado." };
  }

  const patientId = removed[0]?.patient_id as string | undefined;
  revalidatePath(
    patientId ? `/prontuario/${patientId}/receituario` : "/prontuario",
  );
  return { ok: true };
}
