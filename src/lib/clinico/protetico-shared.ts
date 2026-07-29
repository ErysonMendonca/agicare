// Constantes e tipos do fluxo protético — SEM dependências de servidor
// (importável tanto por Server quanto por Client Components).

/** Tipos de trabalho protético oferecidos (botões da Etapa 1). */
export const TIPOS_TRABALHO = [
  "Coroa",
  "Faceta / Lente",
  "PPF",
  "Protocolo",
  "Inlay/Onlay/Overlay",
  "Provisório",
  "Prótese Total",
  "PPR",
  "Flex",
  "Placa de Bruxismo",
  "Núcleo",
] as const;
export type TipoTrabalho = string;

/** Categorias de anexo aceitas no bucket 'protetico'. */
export const TIPOS_ARQUIVO = [
  ["scan", "Scan / STL"],
  ["foto", "Foto"],
  ["radiografia", "Radiografia"],
  ["mordida", "Guia de Mordida"],
] as const;
export type KindArquivo = (typeof TIPOS_ARQUIVO)[number][0];

export function rotuloKind(kind: string): string {
  return TIPOS_ARQUIVO.find(([k]) => k === kind)?.[1] ?? kind;
}

export type ArquivoProtetico = {
  id: string;
  fileName: string;
  storagePath: string;
  kind: string;
  sizeBytes: number | null;
};

export type PedidoProtetico = {
  id: string;
  teeth: string;
  workType: string;
  urgent: boolean;
  dueDate: string | null;
  material: string;
  color: string;
  /** Linha de término (ex.: chanfro, ombro). Campo dedicado da 0039. */
  finishLine: string;
  /** Relação/ajuste oclusal. Campo dedicado da 0039. */
  occlusion: string;
  clinicalNotes: string;
  status: string;
  profissional: string;
  criadoEm: string;
  /** Nº do atendimento (queue_entries.attendance_code) em que foi gerado; null = legado/sem vínculo. */
  atendimentoCodigo: string | null;
  arquivos: ArquivoProtetico[];
  /** Cancelamento (não destrutivo): null = pedido ativo. */
  cancelledAt: string | null;
  cancelReason: string | null;
};
