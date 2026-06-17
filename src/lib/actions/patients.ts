"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { requireClinic } from "@/lib/tenant";

export type ActionState = { error?: string; ok?: boolean } | undefined;

const patientSchema = z.object({
  full_name: z.string().min(2, "Nome muito curto"),
  cpf: z.string().trim().optional().or(z.literal("")),
  birth_date: z.string().trim().optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  convenio: z.string().trim().optional().or(z.literal("")),
  blood_type: z.string().trim().optional().or(z.literal("")),
});

/** Cria um paciente. Valida com Zod e insere via cliente de servidor (RLS). */
export async function createPatient(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = patientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  // Em modo demo não há banco — apenas simula sucesso.
  if (isDemoMode()) return { ok: true };

  const d = parsed.data;
  const clinicId = await requireClinic();
  const supabase = await createClient();
  const { error } = await supabase.from("patients").insert({
    clinic_id: clinicId,
    full_name: d.full_name,
    cpf: d.cpf || null,
    birth_date: d.birth_date || null,
    phone: d.phone || null,
    email: d.email || null,
    convenio: d.convenio || null,
    blood_type: d.blood_type || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/pacientes");
  return { ok: true };
}
