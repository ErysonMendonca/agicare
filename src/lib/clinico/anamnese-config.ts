// Motor de anamnese dinâmica por especialidade — módulo PURO (client-safe).
// Sem imports de servidor: pode ser usado tanto em Server quanto Client Components.

export type CampoAnamnese =
  | { tipo: "checkboxes"; key: string; label: string; opcoes: string[] }
  | {
      tipo: "texto";
      key: string;
      label: string;
      placeholder?: string;
      /** Destaque amarelo (ex.: alergias). */
      destaque?: "amarelo";
    }
  | { tipo: "textarea"; key: string; label: string; placeholder?: string }
  | {
      tipo: "sim_nao";
      key: string;
      label: string;
      /** Quando "sim", dispara alerta vermelho (ex.: risco pré-diabético). */
      alertaSim?: "vermelho";
    };

export type BlocoAnamnese = {
  titulo: string;
  descricao?: string;
  campos: CampoAnamnese[];
};

/** Bloco obrigatório comum a todas as especialidades. */
export const HISTORICO_GERAL: BlocoAnamnese = {
  titulo: "Histórico Geral de Saúde",
  descricao: "Bloco obrigatório — preencher para qualquer especialidade.",
  campos: [
    {
      tipo: "checkboxes",
      key: "doencas_sistemicas",
      label: "Doenças sistêmicas",
      opcoes: [
        "Hipertensão",
        "Diabetes",
        "Cardiopatia",
        "Doença renal",
        "Doença hepática",
        "Distúrbio de coagulação",
        "Doença respiratória",
        "Tireoide",
      ],
    },
    {
      tipo: "textarea",
      key: "medicamentos",
      label: "Medicamentos em uso",
      placeholder: "Liste os medicamentos de uso contínuo...",
    },
    {
      tipo: "texto",
      key: "alergias",
      label: "Alergias",
      placeholder: "Medicamentos, alimentos, látex...",
      destaque: "amarelo",
    },
    {
      tipo: "textarea",
      key: "antecedentes",
      label: "Antecedentes (pessoais e familiares)",
      placeholder: "Cirurgias, internações, histórico familiar...",
    },
    {
      tipo: "textarea",
      key: "habitos",
      label: "Hábitos",
      placeholder: "Tabagismo, etilismo, atividade física, sono...",
    },
  ],
};

/** Módulos específicos por especialidade (chave normalizada). */
const MODULOS: Record<string, BlocoAnamnese> = {
  odontologico: {
    titulo: "Módulo Odontológico",
    campos: [
      {
        tipo: "checkboxes",
        key: "odonto_queixas",
        label: "Queixas odontológicas",
        opcoes: [
          "Dor",
          "Sangramento gengival",
          "Sensibilidade",
          "Mobilidade dentária",
          "Mau hálito",
        ],
      },
      {
        tipo: "sim_nao",
        key: "odonto_bruxismo",
        label: "Relata bruxismo / apertamento?",
      },
      {
        tipo: "textarea",
        key: "odonto_higiene",
        label: "Higiene bucal e hábitos",
        placeholder: "Frequência de escovação, uso de fio dental...",
      },
    ],
  },
  podologico: {
    titulo: "Módulo Podológico",
    campos: [
      {
        tipo: "sim_nao",
        key: "podo_risco_pre_diabetico",
        label: "Risco pré-diabético / glicemia alterada?",
        alertaSim: "vermelho",
      },
      {
        tipo: "checkboxes",
        key: "podo_achados",
        label: "Achados nos pés",
        opcoes: [
          "Onicomicose",
          "Calosidade",
          "Unha encravada",
          "Fissuras",
          "Alteração de sensibilidade",
        ],
      },
      {
        tipo: "textarea",
        key: "podo_circulacao",
        label: "Circulação e sensibilidade",
        placeholder: "Pulsos, enchimento capilar, queixas de dormência...",
      },
    ],
  },
  estetico: {
    titulo: "Módulo Estético",
    campos: [
      {
        tipo: "textarea",
        key: "estetico_objetivo",
        label: "Objetivo do tratamento",
        placeholder: "Demanda principal do paciente...",
      },
      {
        tipo: "checkboxes",
        key: "estetico_procedimentos_previos",
        label: "Procedimentos estéticos prévios",
        opcoes: [
          "Toxina botulínica",
          "Preenchimento",
          "Peeling",
          "Laser",
          "Nenhum",
        ],
      },
      {
        tipo: "sim_nao",
        key: "estetico_gestante",
        label: "Gestante ou amamentando?",
        alertaSim: "vermelho",
      },
    ],
  },
};

/** Normaliza a especialidade para a chave do módulo. */
export function chaveEspecialidade(specialty: string | null): string | null {
  if (!specialty) return null;
  const s = specialty.toLowerCase();
  if (s.includes("odonto")) return "odontologico";
  if (s.includes("podo")) return "podologico";
  if (s.includes("estet") || s.includes("estét")) return "estetico";
  return null;
}

/** Especialidades com módulo específico disponível (para o seletor da ficha). */
export const ESPECIALIDADES_ANAMNESE = [
  { value: "Odontológico", label: "Odontológico" },
  { value: "Podológico", label: "Podológico" },
  { value: "Estético", label: "Estético" },
  { value: "Geral", label: "Clínica Geral" },
] as const;

/** Monta os blocos da anamnese: Histórico Geral + módulo da especialidade. */
export function getAnamneseBlocos(specialty: string | null): BlocoAnamnese[] {
  const chave = chaveEspecialidade(specialty);
  const modulo = chave ? MODULOS[chave] : null;
  return modulo ? [HISTORICO_GERAL, modulo] : [HISTORICO_GERAL];
}
