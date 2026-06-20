import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";

/** Anexo de anamnese (lousa) pronto para exibição. */
export type AnamneseLousa = {
  id: string;
  storagePath: string;
  kind: string;
  note: string | null;
  criadoEm: string;
  /** URL assinada (1h) p/ exibir a imagem; null se indisponível. */
  url: string | null;
};

function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/**
 * Lista os desenhos da lousa de anamnese do paciente com URL assinada (1h) para
 * exibição. Escopo por clínica garantido pela RLS (client server anon+cookies).
 * Resiliente a erro → retorna []. Em demo, devolve [].
 */
export async function listLousas(patientId: string): Promise<AnamneseLousa[]> {
  if (isDemoMode()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("anamnese_files")
    .select("id, storage_path, kind, note, created_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  type Row = {
    id: string;
    storage_path: string;
    kind: string | null;
    note: string | null;
    created_at: string | null;
  };

  const rows = data as unknown as Row[];

  // URLs assinadas em lote (bucket privado). Falha individual → url null.
  const paths = rows.map((r) => r.storage_path);
  const signedByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("anamnese")
      .createSignedUrls(paths, 3600);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    storagePath: r.storage_path,
    kind: r.kind ?? "lousa",
    note: r.note,
    criadoEm: fmtDataHora(r.created_at),
    url: signedByPath.get(r.storage_path) ?? null,
  }));
}
