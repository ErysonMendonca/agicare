/**
 * Modelo compartilhado do formulário de paciente (cadastro em wizard + edição
 * em modal). Centraliza as etapas, os campos obrigatórios e as validações de
 * cliente, para que cadastro e edição tenham o MESMO contrato de validação e
 * o mesmo destaque de erro por campo (borda vermelha).
 */

export const ETAPAS = [
  { id: "pessoais", label: "Dados Pessoais" },
  { id: "contato", label: "Contato e Endereço" },
  { id: "obito", label: "Histórico e Óbito" },
] as const;

export type AbaId = (typeof ETAPAS)[number]["id"];

/**
 * Campos obrigatórios do cadastro (espelham o schema Zod compartilhado
 * `pacienteCampos`). Validados no cliente porque o `required` nativo NÃO
 * dispara em inputs dentro de etapas ocultas (display:none não são focáveis).
 */
export const CAMPOS_OBRIGATORIOS: {
  name: string;
  label: string;
  aba: AbaId;
  minDigits?: number;
  /** Campo alternativo que também satisfaz a obrigatoriedade (ex.: celular no lugar do telefone). */
  altName?: string;
}[] = [
  { name: "full_name", label: "Nome completo", aba: "pessoais" },
  { name: "cpf", label: "CPF", aba: "pessoais" },
  { name: "birth_date", label: "Data de nascimento", aba: "pessoais" },
  { name: "gender", label: "Gênero", aba: "pessoais" },
  {
    name: "phone",
    label: "Telefone ou celular",
    aba: "contato",
    minDigits: 8,
    altName: "cell",
  },
];

/** Um campo obrigatório está faltando neste FormData? */
function campoFaltando(
  fd: FormData,
  campo: (typeof CAMPOS_OBRIGATORIOS)[number],
): boolean {
  const bruto = String(fd.get(campo.name) ?? "").trim();
  if (campo.minDigits) {
    const alt = campo.altName ? String(fd.get(campo.altName) ?? "").trim() : "";
    const digitos = (v: string) => v.replace(/\D/g, "").length;
    return (
      digitos(bruto) < campo.minDigits && digitos(alt) < campo.minDigits
    );
  }
  return bruto === "";
}

/**
 * Valida TODOS os campos obrigatórios de UMA etapa e devolve um mapa
 * campo→mensagem (vazio quando a etapa está ok). Usado pelo wizard antes de
 * "Avançar" e no submit final para pintar as bordas em vermelho.
 */
export function validarEtapa(
  fd: FormData,
  aba: AbaId,
): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const campo of CAMPOS_OBRIGATORIOS) {
    if (campo.aba !== aba) continue;
    if (campoFaltando(fd, campo)) {
      erros[campo.name] = `Informe: ${campo.label}`;
    }
  }
  return erros;
}

/**
 * Valida o formulário INTEIRO e devolve { erros, primeiraAba }: o mapa
 * campo→mensagem de todos os obrigatórios faltantes e a etapa do 1º deles
 * (para saltar até ela). Backstop do submit final.
 */
export function validarTudo(fd: FormData): {
  erros: Record<string, string>;
  primeiraAba: AbaId | null;
} {
  const erros: Record<string, string> = {};
  let primeiraAba: AbaId | null = null;
  for (const campo of CAMPOS_OBRIGATORIOS) {
    if (campoFaltando(fd, campo)) {
      erros[campo.name] = `Informe: ${campo.label}`;
      if (!primeiraAba) primeiraAba = campo.aba;
    }
  }
  return { erros, primeiraAba };
}

/** Mapa campo→etapa: usado para saltar à etapa do 1º erro devolvido pelo servidor. */
export const ABA_DO_CAMPO: Record<string, AbaId> = {
  full_name: "pessoais",
  social_name: "pessoais",
  cpf: "pessoais",
  cns: "pessoais",
  birth_date: "pessoais",
  gender: "pessoais",
  mother_name: "pessoais",
  naturality: "pessoais",
  nationality: "pessoais",
  race: "pessoais",
  ethnicity: "pessoais",
  marital_status: "pessoais",
  legal_guardian: "pessoais",
  blood_type: "pessoais",
  convenio: "pessoais",
  plan: "pessoais",
  convenio_carteirinha: "pessoais",
  convenio_validade: "pessoais",
  convenio_titular: "pessoais",
  convenio_acomodacao: "pessoais",
  responsavel_cpf: "pessoais",
  responsavel_parentesco: "pessoais",
  responsavel_telefone: "pessoais",
  origin: "pessoais",
  phone: "contato",
  cell: "contato",
  email: "contato",
  cep: "contato",
  address: "contato",
  district: "contato",
  city: "contato",
  uf: "contato",
  death_date: "obito",
  death_cause: "obito",
};

/** Idade em anos a partir de "YYYY-MM-DD". -1 quando data inválida/ausente. */
export function idadeEmAnos(birth?: string): number {
  const iso = (birth ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return -1;
  const [a, m, dia] = iso.split("-").map(Number);
  const hoje = new Date();
  let idade = hoje.getFullYear() - a;
  const passouAniv =
    hoje.getMonth() + 1 > m ||
    (hoje.getMonth() + 1 === m && hoje.getDate() >= dia);
  if (!passouAniv) idade -= 1;
  return idade;
}

/** Paciente menor de idade (idade conhecida e < 18) → exige representante legal. */
export function ehMenor(birth?: string): boolean {
  const idade = idadeEmAnos(birth);
  return idade >= 0 && idade < 18;
}

/** Convênio que exige carteirinha (qualquer um exceto vazio, Particular e SUS). */
export function convenioExigeCarteirinha(convenio?: string): boolean {
  const c = (convenio ?? "").trim().toLowerCase();
  return c !== "" && c !== "particular" && c !== "sus";
}

export type ViaCep = {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

/** Opções reutilizadas nos selects do cadastro/edição. */
export const OPCOES_RACA = ["Branca", "Preta", "Parda", "Amarela", "Indígena"];
export const OPCOES_CIVIL = [
  "Solteiro(a)",
  "Casado(a)",
  "Divorciado(a)",
  "Viúvo(a)",
  "União estável",
];
export const OPCOES_SANGUE = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
export const OPCOES_ACOMODACAO = ["Enfermaria", "Apartamento"];
export const OPCOES_ORIGEM = [
  "Indicação",
  "Google",
  "Instagram",
  "Redes Sociais",
  "Convênio",
  "Retorno",
  "Passante",
  "Outros",
];
