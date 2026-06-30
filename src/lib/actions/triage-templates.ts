"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { isGestor } from "@/lib/auth";
import { requireClinic } from "@/lib/tenant";
import type { TriageField } from "@/lib/data/triage-templates.shared";

export type ActionState = { error?: string; ok?: boolean } | undefined;

const fieldSchema = z.object({
  id: z.string().trim().min(1, "Campo sem identificador."),
  tipo: z.enum([
    "numero",
    "texto",
    "textarea",
    "checkboxes",
    "sim_nao",
    "select",
    "risco",
  ]),
  label: z.string().trim().min(1, "Campo sem rótulo."),
  section: z.string().trim().optional(),
  options: z.array(z.string().trim().min(1)).optional(),
  placeholder: z.string().trim().optional(),
  unidade: z.string().trim().optional(),
});

const upsertSchema = z.object({
  specialty: z.string().trim().min(1, "Informe a especialidade."),
  fields: z
    .array(fieldSchema)
    .min(1, "Inclua ao menos um campo.")
    // ids únicos dentro do template
    .superRefine((fields, ctx) => {
      const seen = new Set<string>();
      for (const f of fields) {
        if (seen.has(f.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Campo duplicado: ${f.id}`,
          });
        }
        seen.add(f.id);
      }
    }),
});

/**
 * Cria/atualiza o template de triagem de uma especialidade na clínica ativa.
 * Gate: gestor (admin) + clínica ativa. Upsert por (clinic_id, specialty).
 */
export async function upsertTriageTemplate(
  specialty: string,
  fields: TriageField[],
): Promise<ActionState> {
  if (isDemoMode()) {
    return { error: "Edição indisponível no modo demonstração." };
  }

  if (!(await isGestor())) {
    return { error: "Sem permissão para editar templates de triagem." };
  }

  const clinicId = await requireClinic();

  const parsed = upsertSchema.safeParse({ specialty, fields });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("triage_templates").upsert(
    {
      clinic_id: clinicId,
      specialty: parsed.data.specialty,
      fields: parsed.data.fields,
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "clinic_id,specialty" },
  );

  if (error) {
    return { error: "Não foi possível salvar o template." };
  }

  revalidatePath("/configuracoes");
  revalidatePath("/fila");

  return { ok: true };
}
