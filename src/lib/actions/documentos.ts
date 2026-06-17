"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";
import { getMyProfessionalId } from "@/lib/clinico/professional";
import { requireClinic } from "@/lib/tenant";

export type ActionState = { error?: string; ok?: boolean } | undefined;

const atestadoSchema = z.object({
  patientId: z.string().min(1, "Paciente inválido."),
  dias: z.coerce.number().int().min(1, "Informe os dias de afastamento."),
  inicio: z.string().min(1, "Informe o início."),
  fim: z.string().min(1, "Informe o fim."),
  diagnostico: z.string().trim().min(1, "Informe o diagnóstico."),
  // CID-10 OPCIONAL por LGPD.
  cid10: z.string().trim().optional(),
});

export type AtestadoInput = z.infer<typeof atestadoSchema>;

/** Emite um atestado médico (CID-10 opcional por LGPD). */
export async function emitirAtestado(input: AtestadoInput): Promise<ActionState> {
  const parsed = atestadoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  if (isDemoMode()) return { ok: true };

  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };

  const supabase = await createClient();
  const professionalId = await getMyProfessionalId(current.userId);
  if (!professionalId)
    return { error: "Profissional não encontrado para o usuário atual." };

  const clinicId = await requireClinic();
  const d = parsed.data;
  const { error } = await supabase.from("certificates").insert({
    clinic_id: clinicId,
    patient_id: d.patientId,
    professional_id: professionalId,
    kind: "atestado",
    days: d.dias,
    start_date: d.inicio,
    end_date: d.fim,
    diagnosis: d.diagnostico,
    cid10: d.cid10 || null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/prontuario/${d.patientId}/documentos`);
  return { ok: true };
}

const altaSchema = z.object({
  patientId: z.string().min(1, "Paciente inválido."),
  motivo: z.string().trim().min(1, "Informe o motivo da alta."),
  diagnostico: z.string().trim().min(1, "Informe o diagnóstico principal."),
  orientacoes: z.string().trim().min(1, "Informe as orientações pós-alta."),
});

export type AltaInput = z.infer<typeof altaSchema>;

/** Registra uma alta (motivo, diagnóstico principal e orientações pós-alta). */
export async function darAlta(input: AltaInput): Promise<ActionState> {
  const parsed = altaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  if (isDemoMode()) return { ok: true };

  const current = await getCurrentUser();
  if (!current) return { error: "Sessão expirada." };

  const supabase = await createClient();
  const professionalId = await getMyProfessionalId(current.userId);
  if (!professionalId)
    return { error: "Profissional não encontrado para o usuário atual." };

  const clinicId = await requireClinic();
  const d = parsed.data;
  const { error } = await supabase.from("certificates").insert({
    clinic_id: clinicId,
    patient_id: d.patientId,
    professional_id: professionalId,
    kind: "alta",
    reason: d.motivo,
    diagnosis: d.diagnostico,
    post_discharge: d.orientacoes,
  });
  if (error) return { error: error.message };

  revalidatePath(`/prontuario/${d.patientId}/documentos`);
  return { ok: true };
}
