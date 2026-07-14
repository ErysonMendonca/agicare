// Constantes e tipos de Pedidos de Exames — SEM dependências de servidor
// (importável por Server e Client Components).

export type ExamCategoria = "laboratorial" | "imagem";
export type ExamStatus = "solicitado" | "concluido";

/** Pedido de exame com campos amigáveis para a UI (5.6). */
export type ExamOrder = {
  id: string;
  exame: string;
  tuss: string | null;
  categoria: ExamCategoria;
  status: ExamStatus;
  observacoes: string | null;
  /** Lateralidade (Direito/Esquerdo/Bilateral/…); null quando não se aplica. */
  lateralidade: string | null;
  /** Data/hora da solicitação já formatada (pt-BR). */
  quando: string;
  /** Cancelamento (não destrutivo): null = pedido ativo. */
  cancelledAt: string | null;
  cancelReason: string | null;
};

/** Opções de lateralidade (documento de imagem/procedimento). */
export const LATERALIDADES = [
  "Não se aplica",
  "Direito",
  "Esquerdo",
  "Bilateral",
] as const;

/** Item do catálogo TUSS (código oficial p/ faturamento). */
export type TussExame = {
  tuss: string;
  nome: string;
  categoria: ExamCategoria;
};

/**
 * Catálogo enxuto de exames comuns por código TUSS. Reutilizado pela UI para
 * preencher o select de solicitação (código + categoria). Não é exaustivo —
 * cobre os exames de rotina mais pedidos no protótipo.
 */
export const EXAMES_TUSS: TussExame[] = [
  { tuss: "40304361", nome: "Hemograma completo", categoria: "laboratorial" },
  { tuss: "40301630", nome: "Glicemia de jejum", categoria: "laboratorial" },
  { tuss: "40301826", nome: "Colesterol total", categoria: "laboratorial" },
  { tuss: "40301842", nome: "Triglicerídeos", categoria: "laboratorial" },
  { tuss: "40316105", nome: "TSH - Hormônio tireoestimulante", categoria: "laboratorial" },
  { tuss: "40302350", nome: "Creatinina", categoria: "laboratorial" },
  { tuss: "40302679", nome: "Ácido úrico", categoria: "laboratorial" },
  { tuss: "40311070", nome: "Urina tipo I (EAS)", categoria: "laboratorial" },
  { tuss: "40901114", nome: "Raio-X de tórax", categoria: "imagem" },
  { tuss: "40901157", nome: "Ultrassonografia de abdome total", categoria: "imagem" },
  { tuss: "40808017", nome: "Eletrocardiograma (ECG)", categoria: "imagem" },
  { tuss: "40901041", nome: "Endoscopia digestiva alta", categoria: "imagem" },
];
