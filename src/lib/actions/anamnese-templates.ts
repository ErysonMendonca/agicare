"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { isGestor } from "@/lib/auth";
import { requireClinic } from "@/lib/tenant";
import type { AnamneseField } from "@/lib/data/anamnese-templates.shared";

export type ActionState = { error?: string; ok?: boolean } | undefined;

const fieldSchema = z.object({
  id: z.string().trim().min(1, "Campo sem identificador."),
  tipo: z.enum(["texto", "textarea", "checkboxes", "sim_nao", "select"]),
  label: z.string().trim().min(1, "Campo sem rótulo."),
  section: z.string().trim().optional(),
  options: z.array(z.string().trim().min(1)).optional(),
  placeholder: z.string().trim().optional(),
  destaque: z.literal("amarelo").optional(),
  alertaSim: z.literal("vermelho").optional(),
});

const upsertSchema = z.object({
  specialty: z.string().trim().min(1, "Informe a especialidade."),
  // Caminho da imagem de fundo da lousa (bucket 'anamnese'); "" ou null = sem.
  lousaImagePath: z.string().trim().max(500).nullish(),
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
 * Cria/atualiza o template de anamnese de uma especialidade na clínica ativa.
 * Gate: gestor (admin) + clínica ativa. Upsert por (clinic_id, specialty).
 */
export async function upsertAnamneseTemplate(
  specialty: string,
  fields: AnamneseField[],
  lousaImagePath?: string | null,
): Promise<ActionState> {
  if (isDemoMode()) {
    return { error: "Edição indisponível no modo demonstração." };
  }

  if (!(await isGestor())) {
    return { error: "Sem permissão para editar templates de anamnese." };
  }

  const clinicId = await requireClinic();

  const parsed = upsertSchema.safeParse({ specialty, fields, lousaImagePath });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  // Defesa em profundidade: a imagem de fundo só pode apontar para a pasta de
  // templates DESTA clínica (impede referenciar objeto de outra clínica/paciente).
  const imgPath = parsed.data.lousaImagePath || null;
  if (imgPath && !imgPath.startsWith(`${clinicId}/templates/`)) {
    return { error: "Caminho de imagem inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("anamnese_templates").upsert(
    {
      clinic_id: clinicId,
      specialty: parsed.data.specialty,
      fields: parsed.data.fields,
      lousa_image_path: imgPath,
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "clinic_id,specialty" },
  );

  if (error) {
    return { error: "Não foi possível salvar o template." };
  }

  revalidatePath("/configuracoes");
  revalidatePath("/prontuario");

  return { ok: true };
}
