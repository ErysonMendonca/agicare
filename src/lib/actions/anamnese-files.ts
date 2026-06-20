"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { requireClinico } from "@/lib/auth";
import { getActiveClinicId } from "@/lib/tenant";

export type ActionState = { error?: string; ok?: boolean } | undefined;

/** Bucket privado dedicado aos anexos de anamnese (PNG da lousa). */
const BUCKET = "anamnese";
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

const salvarSchema = z.object({
  patientId: z.string().uuid("Paciente inválido."),
  // data URL de imagem PNG vinda do <canvas>.toDataURL("image/png").
  dataUrl: z
    .string()
    .regex(/^data:image\/png;base64,/, "Imagem inválida."),
  note: z.string().trim().max(2000).optional(),
});

export type SalvarLousaInput = z.infer<typeof salvarSchema>;

/**
 * Persiste o desenho da "lousa" da anamnese: recebe o PNG (data URL base64) do
 * canvas, faz upload no bucket privado `anamnese` (caminho escopado por
 * clinic_id/patient_id) e registra a referência em `anamnese_files`.
 *
 * Acesso restrito a clínico (admin/médico) — dado clínico/LGPD. Usa o client
 * server (anon + cookies); a RLS do Storage e da tabela garante o isolamento
 * por clínica.
 */
export async function salvarLousa(input: SalvarLousaInput): Promise<ActionState> {
  const parsed = salvarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const d = parsed.data;

  if (isDemoMode()) return { ok: true };

  const guard = await requireClinico();
  if ("error" in guard) return { error: guard.error };

  const clinicId = await getActiveClinicId();
  if (!clinicId) return { error: "Nenhuma clínica ativa selecionada." };

  // Decodifica o base64 para bytes (upload server-side, não expõe o bucket).
  const base64 = d.dataUrl.slice(d.dataUrl.indexOf(",") + 1);
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    return { error: "Imagem inválida." };
  }
  if (bytes.length === 0) return { error: "Imagem vazia." };
  if (bytes.length > MAX_BYTES) return { error: "A imagem excede o limite de 5MB." };

  const supabase = await createClient();
  const storagePath = `${clinicId}/${d.patientId}/${Date.now()}.png`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: "image/png", upsert: false });
  if (upErr) return { error: `Falha no upload do desenho: ${upErr.message}` };

  const { error } = await supabase.from("anamnese_files").insert({
    clinic_id: clinicId,
    patient_id: d.patientId,
    storage_path: storagePath,
    kind: "lousa",
    note: d.note || null,
    created_by: guard.userId,
  });
  if (error) {
    // Rollback do binário órfão se o insert falhar.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { error: error.message };
  }

  revalidatePath(`/prontuario/${d.patientId}/anamnese`);
  return { ok: true };
}
