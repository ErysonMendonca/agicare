"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { requireClinico, isGestor } from "@/lib/auth";
import { getActiveClinicId } from "@/lib/tenant";
import { slugEspecialidade } from "@/lib/data/anamnese-templates";

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

// ════════════════════════════════════════════════════════════════
// Imagem de fundo da lousa (pré-fixada por especialidade) — gestor
// ════════════════════════════════════════════════════════════════

/** Tipos de imagem aceitos como fundo da lousa (data URL). */
const IMG_DATAURL = /^data:image\/(png|jpeg|jpg|webp);base64,/;

const imagemLousaSchema = z.object({
  specialty: z.string().trim().min(1, "Informe a especialidade."),
  dataUrl: z.string().regex(IMG_DATAURL, "Imagem inválida (use PNG/JPG/WEBP)."),
  // Caminho anterior (para apagar o binário ao trocar) — validado por prefixo.
  previousPath: z.string().trim().max(500).nullish(),
});

/** Confere os magic bytes do buffer contra o MIME declarado. */
function magicBytesOk(mime: string, b: Buffer): boolean {
  if (mime === "image/png")
    return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (mime === "image/jpeg")
    return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === "image/webp")
    return (
      b.length > 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP"
    );
  return false;
}

export type SalvarImagemLousaResult =
  | { ok: true; path: string }
  | { ok?: false; error: string };

/**
 * Sobe a IMAGEM DE FUNDO da lousa de um template de anamnese (por
 * especialidade), no bucket privado `anamnese`, caminho
 * `${clinicId}/templates/lousa-<especialidade>-<ts>.png`. Devolve o
 * storage_path para o builder persistir junto do template (upsertAnamneseTemplate).
 *
 * Gate: GESTOR (admin) — é configuração da clínica, não dado de paciente. A
 * policy do Storage exige is_staff() + bucket; o caminho embute o clinic_id.
 */
export async function salvarImagemLousaTemplate(
  input: z.infer<typeof imagemLousaSchema>,
): Promise<SalvarImagemLousaResult> {
  const parsed = imagemLousaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (isDemoMode()) {
    return { error: "Edição indisponível no modo demonstração." };
  }

  if (!(await isGestor())) {
    return { error: "Sem permissão para configurar a lousa." };
  }

  const clinicId = await getActiveClinicId();
  if (!clinicId) return { error: "Nenhuma clínica ativa selecionada." };

  const d = parsed.data;
  // Normaliza o MIME: 'image/jpg' (inexistente) → 'image/jpeg'.
  const rawMime = d.dataUrl.slice(5, d.dataUrl.indexOf(";"));
  const mime = rawMime === "image/jpg" ? "image/jpeg" : rawMime;
  const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
  const base64 = d.dataUrl.slice(d.dataUrl.indexOf(",") + 1);

  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    return { error: "Imagem inválida." };
  }
  if (bytes.length === 0) return { error: "Imagem vazia." };
  if (bytes.length > MAX_BYTES) return { error: "A imagem excede o limite de 5MB." };
  // Confere os magic bytes (não confia só no prefixo textual do data URL).
  if (!magicBytesOk(mime, bytes)) return { error: "Arquivo de imagem inválido." };

  const supabase = await createClient();
  const storagePath = `${clinicId}/templates/lousa-${slugEspecialidade(
    d.specialty,
  )}-${Date.now()}.${ext}`;

  // upsert:false — o timestamp garante unicidade; nega sobrescrita silenciosa.
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (upErr) return { error: `Falha no upload da imagem: ${upErr.message}` };

  // Best-effort: remove o binário anterior (só se for da pasta de templates
  // desta clínica) para não acumular órfão ao trocar a imagem.
  const prev = d.previousPath?.trim();
  if (prev && prev.startsWith(`${clinicId}/templates/`) && prev !== storagePath) {
    await supabase.storage.from(BUCKET).remove([prev]);
  }

  return { ok: true, path: storagePath };
}
