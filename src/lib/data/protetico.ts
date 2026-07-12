import { createClient } from "@/lib/supabase/server";

// Constantes e tipos vivem em módulo client-safe (sem next/headers),
// reexportados aqui para os consumidores existentes.
export {
  TIPOS_TRABALHO,
  TIPOS_ARQUIVO,
  rotuloKind,
} from "@/lib/clinico/protetico-shared";
export type {
  TipoTrabalho,
  KindArquivo,
  ArquivoProtetico,
  PedidoProtetico,
} from "@/lib/clinico/protetico-shared";

import type { PedidoProtetico } from "@/lib/clinico/protetico-shared";

function fmtData(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR");
}

function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

const DEMO_PEDIDOS: PedidoProtetico[] = [
  {
    id: "demo-prot-1",
    teeth: "11, 21",
    workType: "Faceta",
    urgent: false,
    dueDate: "25/06/2026",
    material: "Dissilicato de lítio (e.max)",
    color: "A2",
    finishLine: "Chanfro supragengival",
    occlusion: "Guia incisal preservada; sem contatos em protrusão",
    clinicalNotes:
      "Preservar mamelões incisais. Mock-up aprovado pelo paciente.",
    status: "aberto",
    profissional: "Dra. Ana Beatriz Costa",
    criadoEm: "15/06/2026 09:10",
    arquivos: [
      {
        id: "demo-file-1",
        fileName: "scan-arcada-superior.stl",
        storagePath: "demo/scan-arcada-superior.stl",
        kind: "scan",
        sizeBytes: 4_812_344,
      },
      {
        id: "demo-file-2",
        fileName: "foto-sorriso.jpg",
        storagePath: "demo/foto-sorriso.jpg",
        kind: "foto",
        sizeBytes: 1_204_553,
      },
    ],
    cancelledAt: null,
    cancelReason: null,
  },
  {
    id: "demo-prot-2",
    teeth: "36",
    workType: "Coroa",
    urgent: true,
    dueDate: "20/06/2026",
    material: "Zircônia monolítica",
    color: "A3",
    finishLine: "Ombro arredondado",
    occlusion: "Pré-molarizar oclusão; contato proximal mesial leve",
    clinicalNotes: "",
    status: "aberto",
    profissional: "Dr. João Silva",
    criadoEm: "14/06/2026 16:42",
    arquivos: [
      {
        id: "demo-file-3",
        fileName: "radiografia-periapical.png",
        storagePath: "demo/radiografia-periapical.png",
        kind: "radiografia",
        sizeBytes: 856_201,
      },
    ],
    cancelledAt: null,
    cancelReason: null,
  },
];

/**
 * Lista os pedidos protéticos do paciente com seus anexos (join prosthetic_files).
 * Resiliente a erro → retorna []. Em modo demo, devolve mocks.
 */
export async function listPedidosProteticos(
  patientId: string,
): Promise<PedidoProtetico[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prosthetic_orders")
    .select(
      "id, teeth, work_type, urgent, due_date, material, color, finish_line, occlusion, clinical_notes, status, created_at, cancelled_at, cancel_reason, " +
        "professionals(profiles(full_name)), " +
        "prosthetic_files(id, file_name, storage_path, kind, size_bytes, created_at)",
    )
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  type ProfileJoin = { full_name: string | null };
  type ProfJoin = { profiles: ProfileJoin | ProfileJoin[] | null };
  type FileRow = {
    id: string;
    file_name: string;
    storage_path: string;
    kind: string | null;
    size_bytes: number | null;
  };
  type OrderRow = {
    id: string;
    teeth: string | null;
    work_type: string | null;
    urgent: boolean | null;
    due_date: string | null;
    material: string | null;
    color: string | null;
    finish_line: string | null;
    occlusion: string | null;
    clinical_notes: string | null;
    status: string | null;
    created_at: string | null;
    cancelled_at: string | null;
    cancel_reason: string | null;
    professionals: ProfJoin | ProfJoin[] | null;
    prosthetic_files: FileRow[] | null;
  };

  return (data as unknown as OrderRow[]).map((r) => {
    const prof = Array.isArray(r.professionals)
      ? r.professionals[0]
      : r.professionals;
    const profile = Array.isArray(prof?.profiles)
      ? prof?.profiles[0]
      : prof?.profiles;

    const files = Array.isArray(r.prosthetic_files) ? r.prosthetic_files : [];

    return {
      id: r.id as string,
      teeth: (r.teeth as string | null) ?? "—",
      workType: (r.work_type as string | null) ?? "—",
      urgent: Boolean(r.urgent),
      dueDate: fmtData(r.due_date as string | null),
      material: (r.material as string | null) ?? "—",
      color: (r.color as string | null) ?? "—",
      finishLine: (r.finish_line as string | null) ?? "",
      occlusion: (r.occlusion as string | null) ?? "",
      clinicalNotes: (r.clinical_notes as string | null) ?? "",
      status: (r.status as string | null) ?? "aberto",
      profissional: profile?.full_name ?? "—",
      criadoEm: fmtDataHora(r.created_at as string | null),
      arquivos: files.map((f) => ({
        id: f.id as string,
        fileName: f.file_name as string,
        storagePath: f.storage_path as string,
        kind: (f.kind as string | null) ?? "scan",
        sizeBytes: (f.size_bytes as number | null) ?? null,
      })),
      cancelledAt: (r.cancelled_at as string | null) ?? null,
      cancelReason: (r.cancel_reason as string | null) ?? null,
    };
  });
}
