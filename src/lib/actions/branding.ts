"use server";

import { createClient } from "@/lib/supabase/server";
import { isGestor } from "@/lib/auth";
import { requireClinic } from "@/lib/tenant";

/** Bucket público de assets da clínica (criado pela migration 0032). */
const BUCKET = "clinic-assets";

const MAX_BYTES = 512 * 1024; // 512 KB
const ALLOWED = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

export type UploadLogoResult = { url?: string; error?: string };

/**
 * Faz upload do logotipo da clínica para o Supabase Storage e devolve a URL
 * pública. Caminho isolado por clínica (`<clinicId>/logo-*`).
 *
 * Robustez do protótipo: se o Storage NÃO estiver provisionado (bucket ausente)
 * ou estivermos em modo demo, retorna sem URL — o cliente cai no fallback de
 * data URL (preview imediato) e o branding ainda persiste via salvarConfiguracoes.
 * Gestor-only (reforço no servidor; a UI já restringe).
 */
export async function uploadLogo(formData: FormData): Promise<UploadLogoResult> {
  if (!(await isGestor())) return { error: "Acesso restrito ao gestor." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Arquivo inválido." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "Logo muito grande (máximo 512 KB)." };
  }
  if (!ALLOWED.includes(file.type)) {
    return { error: "Formato não suportado (use PNG, JPG, SVG ou WEBP)." };
  }

  // Sem backend (demo): cliente usa o data URL de preview.

  const supabase = await createClient();
  const clinicId = await requireClinic();

  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${clinicId}/logo-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600",
  });

  // Bucket ausente / Storage indisponível → fallback silencioso (data URL).
  if (error) return {};

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}
