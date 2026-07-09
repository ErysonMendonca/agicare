import { createClient } from "@/lib/supabase/server";
import { getActiveClinicId } from "@/lib/tenant";
import { type Status } from "@/components/ui/Badge";

export type Convenio = "Convênio" | "Particular";

export type Evento = {
  codigo: string;
  paciente: string;
  profissional: string;
  data: string;
  valor: string;
  /** Valor numérico (em reais) usado para somar os KPIs. */
  valorNumerico: number;
  servico: string;
  tipo: Convenio;
  status: { label: string; tone: Status };
  faturavel: boolean;
  /** Status cru do banco (pendente|faturado|glosado) — decide as ações da linha. */
  statusRaw: string;
};

/**
 * Check-out salvo (confirmado) — serve tanto para VISUALIZAR/IMPRIMIR o recibo
 * quanto para EDITAR (reabrir a conferência pré-preenchida com o que foi gravado).
 */
export type CheckoutSalvo = {
  codigo: string;
  paciente: string;
  data: string;
  /** Forma de cobrança gravada (kind). */
  forma: "particular" | "convenio" | "empresa";
  /** Forma de pagamento (payment_method: pix|cartao|boleto) quando particular. */
  pagamento: string | null;
  itens: ItemCheckout[];
  desconto: number;
  acrescimo: number;
  total: number;
  /** Dados da NF (pagador empresa) — preservados ao editar. */
  nfNumero: string;
  nfEmissao: string;
  nfVencimento: string;
  nfPrazos: string;
};

/** Mapeia status do banco → rótulo + tom do Badge. */
function mapStatus(status: string): { label: string; tone: Status } {
  switch (status) {
    case "faturado":
      return { label: "Faturado", tone: "active" };
    case "glosado":
      return { label: "Glosado", tone: "danger" };
    case "pendente":
    default:
      return { label: "Pendente", tone: "warn" };
  }
}

/** Mapeia kind do banco → tipo exibido na página. */
function mapTipo(kind: string): Convenio {
  return kind === "particular" ? "Particular" : "Convênio";
}

/** Formata um número em moeda R$ pt-BR. */
function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/** Formata um timestamp em DD/MM/AAAA. */
function formatData(createdAt: string | null): string {
  if (!createdAt) return "—";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

/** Mock usado no modo demo (espelha o Figma). */
const MOCK: Evento[] = [
  {
    codigo: "EVT-2024-001",
    paciente: "Maria Silva Santos",
    profissional: "Dr. Carlos Mendes",
    data: "14/01/2024",
    valor: "R$ 350,00",
    valorNumerico: 350,
    servico: "Consulta + Exames",
    tipo: "Convênio",
    status: { label: "Pendente", tone: "warn" },
    faturavel: true,
    statusRaw: "pendente",
  },
  {
    codigo: "EVT-2024-002",
    paciente: "João Pedro Costa",
    profissional: "Dra. Ana Paula Oliveira",
    data: "14/01/2024",
    valor: "R$ 1.200,00",
    valorNumerico: 1200,
    servico: "Procedimento Cirúrgico",
    tipo: "Particular",
    status: { label: "Pendente", tone: "warn" },
    faturavel: true,
    statusRaw: "pendente",
  },
  {
    codigo: "EVT-2024-003",
    paciente: "Carla Souza Lima",
    profissional: "Dr. Roberto Alves",
    data: "13/01/2024",
    valor: "R$ 280,00",
    valorNumerico: 280,
    servico: "Consulta de Retorno",
    tipo: "Convênio",
    status: { label: "Faturado", tone: "active" },
    faturavel: false,
    statusRaw: "faturado",
  },
  {
    codigo: "EVT-2024-004",
    paciente: "Fernanda Almeida Rocha",
    profissional: "Dra. Juliana Martins",
    data: "12/01/2024",
    valor: "R$ 150,00",
    valorNumerico: 150,
    servico: "Consulta",
    tipo: "Convênio",
    status: { label: "Glosado", tone: "danger" },
    faturavel: false,
    statusRaw: "glosado",
  },
];

// ════════════════════════════════════════════════════════════════
// Convênios TISS — guias e lotes XML.
// ════════════════════════════════════════════════════════════════

export type TissGuideStatus = "validada" | "alerta" | "erro";

export type GuiaTISS = {
  id: string;
  numero: string;
  paciente: string;
  convenio: string;
  procedimento: string;
  valorNumerico: number;
  valor: string;
  status: { label: string; tone: Status };
  validacao: TissGuideStatus;
  observacao: string | null;
  loteCodigo: string | null;
};

export type TissBatchStatus = "aberto" | "enviado" | "conciliado";

export type LoteTISS = {
  id: string;
  codigo: string;
  convenio: string;
  status: { label: string; tone: Status };
  statusRaw: TissBatchStatus;
  guias: number;
  valorNumerico: number;
  valor: string;
  xmlGerado: boolean;
};

/** Mapeia validação da guia → rótulo + tom do Badge. */
function mapGuiaStatus(status: TissGuideStatus): { label: string; tone: Status } {
  switch (status) {
    case "validada":
      return { label: "Validada", tone: "ok" };
    case "erro":
      return { label: "Com Erro", tone: "danger" };
    case "alerta":
    default:
      return { label: "Com Alerta", tone: "warn" };
  }
}

/** Dados mínimos de uma guia necessários para a validação TISS. */
export type GuiaAvaliavel = {
  temPaciente: boolean;
  insurance: string | null;
  procedure_code: string | null;
  amount: number;
  validation_note: string | null;
};

/**
 * Regras determinísticas de validação de uma guia TISS. Devolve o veredito
 * (validada | alerta | erro) + a nota de validação. Usado tanto pela action
 * (com dados autoritativos do banco) quanto pelo fluxo demo (snapshot).
 */
export function avaliarGuiaTiss(g: GuiaAvaliavel): {
  validacao: TissGuideStatus;
  nota: string | null;
} {
  if (!g.temPaciente) {
    return { validacao: "erro", nota: "Beneficiário não vinculado à guia." };
  }
  if (!g.procedure_code) {
    return { validacao: "erro", nota: "Código TUSS do procedimento ausente." };
  }
  if (!(g.amount > 0)) {
    return { validacao: "erro", nota: "Valor da guia não informado." };
  }
  if (!g.insurance) {
    return {
      validacao: "alerta",
      nota: "Convênio não informado — confirme antes de incluir no lote.",
    };
  }
  // Observação herdada (ex.: CID-10 ausente) mantém o estado de alerta.
  if (g.validation_note) {
    return { validacao: "alerta", nota: g.validation_note };
  }
  return { validacao: "validada", nota: null };
}

/** Mapeia status do lote → rótulo + tom do Badge. */
function mapLoteStatus(status: TissBatchStatus): { label: string; tone: Status } {
  switch (status) {
    case "conciliado":
      return { label: "Conciliado", tone: "ok" };
    case "enviado":
      return { label: "Enviado", tone: "active" };
    case "aberto":
    default:
      return { label: "Aberto", tone: "wait" };
  }
}

const MOCK_GUIAS: GuiaTISS[] = [
  {
    id: "g1",
    numero: "GUIA-000482",
    paciente: "Maria Silva Santos",
    convenio: "Unimed",
    procedimento: "10101012 — Consulta em consultório",
    valorNumerico: 350,
    valor: "R$ 350,00",
    status: mapGuiaStatus("validada"),
    validacao: "validada",
    observacao: null,
    loteCodigo: "LOTE-2024-001",
  },
  {
    id: "g2",
    numero: "GUIA-000483",
    paciente: "Carla Souza Lima",
    convenio: "Bradesco Saúde",
    procedimento: "40304361 — Hemograma completo",
    valorNumerico: 80,
    valor: "R$ 80,00",
    status: mapGuiaStatus("alerta"),
    validacao: "alerta",
    observacao: "CID-10 ausente — preenchimento recomendado.",
    loteCodigo: null,
  },
  {
    id: "g3",
    numero: "GUIA-000484",
    paciente: "Fernanda Almeida Rocha",
    convenio: "SulAmérica",
    procedimento: "31602231 — Procedimento cirúrgico",
    valorNumerico: 1200,
    valor: "R$ 1.200,00",
    status: mapGuiaStatus("erro"),
    validacao: "erro",
    observacao: "Carteirinha do beneficiário inválida.",
    loteCodigo: null,
  },
  {
    id: "g4",
    numero: "GUIA-000485",
    paciente: "João Pedro Costa",
    convenio: "Unimed",
    procedimento: "10101039 — Consulta de retorno",
    valorNumerico: 280,
    valor: "R$ 280,00",
    status: mapGuiaStatus("validada"),
    validacao: "validada",
    observacao: null,
    loteCodigo: "LOTE-2024-001",
  },
];

const MOCK_LOTES: LoteTISS[] = [
  {
    id: "l1",
    codigo: "LOTE-2024-001",
    convenio: "Unimed",
    status: mapLoteStatus("enviado"),
    statusRaw: "enviado",
    guias: 2,
    valorNumerico: 630,
    valor: "R$ 630,00",
    xmlGerado: true,
  },
  {
    id: "l2",
    codigo: "LOTE-2024-002",
    convenio: "Bradesco Saúde",
    status: mapLoteStatus("aberto"),
    statusRaw: "aberto",
    guias: 0,
    valorNumerico: 0,
    valor: "R$ 0,00",
    xmlGerado: false,
  },
];

/** Lista guias TISS: do banco quando configurado, mock no modo demo. */
export async function listTissGuides(): Promise<GuiaTISS[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tiss_guides")
    .select(
      "id, guide_number, insurance, procedure_code, amount, status, validation_note, patients(full_name), tiss_batches(code)",
    )
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((g) => {
    const patient = Array.isArray(g.patients) ? g.patients[0] : g.patients;
    const lote = Array.isArray(g.tiss_batches)
      ? g.tiss_batches[0]
      : g.tiss_batches;
    const valorNumerico = Number(g.amount ?? 0);
    const validacao = (g.status ?? "validada") as TissGuideStatus;
    return {
      id: g.id,
      numero: g.guide_number ?? "—",
      paciente: patient?.full_name ?? "—",
      convenio: g.insurance ?? "—",
      procedimento: g.procedure_code ?? "—",
      valorNumerico,
      valor: formatBRL(valorNumerico),
      status: mapGuiaStatus(validacao),
      validacao,
      observacao: g.validation_note ?? null,
      loteCodigo: lote?.code ?? null,
    };
  });
}

/** Lista lotes TISS: do banco quando configurado, mock no modo demo. */
export async function listTissBatches(): Promise<LoteTISS[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tiss_batches")
    .select("id, code, insurance, status, guides_count, total, xml_generated_at")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((b) => {
    const valorNumerico = Number(b.total ?? 0);
    const statusRaw = (b.status ?? "aberto") as TissBatchStatus;
    return {
      id: b.id,
      codigo: b.code ?? "—",
      convenio: b.insurance ?? "—",
      status: mapLoteStatus(statusRaw),
      statusRaw,
      guias: Number(b.guides_count ?? 0),
      valorNumerico,
      valor: formatBRL(valorNumerico),
      xmlGerado: !!b.xml_generated_at,
    };
  });
}

// ════════════════════════════════════════════════════════════════
// Check-out — itens reais conferidos de um evento faturável.
// Os itens vêm de fontes reais: o procedimento do evento + exames
// solicitados ao paciente (com código TUSS) + materiais do atendimento.
// ════════════════════════════════════════════════════════════════

export type ItemCheckout = {
  /** Origem do item (define cor/rótulo na UI). */
  source: "procedimento" | "exame" | "material" | "ajuste";
  tipo: "TUSS" | "Material";
  codigo: string;
  descricao: string;
  qtd: number;
  valor: number;
};

export type CheckoutData = {
  /** UUID interno do evento (necessário para gravar billing_items). */
  eventId: string | null;
  itens: ItemCheckout[];
};

/**
 * Carrega os itens reais conferidos no check-out de um evento.
 * - procedimento: casado por nome/serviço na tabela `procedures` (código + preço).
 * - exames: pedidos do paciente com `tuss_code` (faturáveis).
 * - material: insumo do atendimento (rateio do restante do valor estimado).
 * No modo demo devolve itens derivados do próprio evento (sem banco).
 */
export async function getCheckoutData(
  code: string,
  fallbackServico: string,
  fallbackValor: number,
): Promise<CheckoutData> {


  const supabase = await createClient();
  const { data: evt } = await supabase
    .from("billable_events")
    .select("id, patient_id, service, amount")
    .eq("code", code)
    .maybeSingle();

  if (!evt) {
    return { eventId: null, itens: [] };
  }

  const valorEvento = Number(evt.amount ?? fallbackValor);
  const servico = evt.service ?? fallbackServico;
  const itens: ItemCheckout[] = [];

  // TODOS os procedimentos lançados no atendimento e vinculados a este evento
  // (billable_event_id) — cada um vira uma linha de cobrança no check-out.
  const clinicId = await getActiveClinicId();
  let execQuery = supabase
    .from("procedure_executions")
    .select("amount, procedures(code, name)")
    .eq("billable_event_id", evt.id);
  // Defesa em profundidade: além do RLS, escopa pela clínica ativa.
  if (clinicId) execQuery = execQuery.eq("clinic_id", clinicId);
  const { data: execs } = await execQuery.order("created_at", {
    ascending: true,
  });

  if (execs && execs.length > 0) {
    for (const ex of execs) {
      const p = (
        Array.isArray(ex.procedures) ? ex.procedures[0] : ex.procedures
      ) as { code: string | null; name: string | null } | null;
      itens.push({
        source: "procedimento",
        tipo: "TUSS",
        codigo: p?.code ?? "10101012",
        descricao: p?.name ?? servico,
        qtd: 1,
        valor: Math.round(Number(ex.amount ?? 0) * 100) / 100,
      });
    }
  } else {
    // Fallback (eventos legados, sem execuções vinculadas): procedimento
    // principal casado pelo nome do serviço, como antes.
    const { data: proc } = await supabase
      .from("procedures")
      .select("code, name, price")
      .ilike("name", servico)
      .limit(1)
      .maybeSingle();

    const procValor = proc?.price ? Number(proc.price) : valorEvento;
    itens.push({
      source: "procedimento",
      tipo: "TUSS",
      codigo: proc?.code ?? "10101012",
      descricao: proc?.name ?? servico,
      qtd: 1,
      valor: Math.round(procValor * 100) / 100,
    });
  }

  // Exames faturáveis do paciente (código TUSS oficial).
  if (evt.patient_id) {
    const { data: exames } = await supabase
      .from("exam_orders")
      .select("tuss_code, exam_name")
      .eq("patient_id", evt.patient_id)
      .not("tuss_code", "is", null)
      .order("created_at", { ascending: false })
      .limit(8);

    for (const ex of exames ?? []) {
      itens.push({
        source: "exame",
        tipo: "TUSS",
        codigo: ex.tuss_code ?? "—",
        descricao: ex.exam_name ?? "Exame",
        qtd: 1,
        valor: 0,
      });
    }
  }

  // Material/insumo: rateio do que sobra do valor estimado do evento.
  const somaTuss = itens.reduce((acc, i) => acc + i.valor * i.qtd, 0);
  const restante = Math.round((valorEvento - somaTuss) * 100) / 100;
  if (restante > 0) {
    itens.push({
      source: "material",
      tipo: "Material",
      codigo: "MAT",
      descricao: "Materiais e insumos do atendimento",
      qtd: 1,
      valor: restante,
    });
  }

  return { eventId: evt.id, itens };
}

/** Lista eventos faturáveis: do banco quando configurado, mock no modo demo. */
export async function listBillableEvents(): Promise<Evento[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billable_events")
    .select(
      "code, kind, service, amount, status, created_at, patients(full_name), professionals(profiles(full_name))",
    )
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((r) => {
    // O join aninhado pode vir como objeto ou array dependendo da relação.
    const patient = Array.isArray(r.patients) ? r.patients[0] : r.patients;
    const professional = Array.isArray(r.professionals)
      ? r.professionals[0]
      : r.professionals;
    const profile = Array.isArray(professional?.profiles)
      ? professional?.profiles[0]
      : professional?.profiles;

    const valorNumerico = Number(r.amount ?? 0);
    const status = r.status ?? "pendente";

    return {
      codigo: r.code ?? "—",
      paciente: patient?.full_name ?? "—",
      profissional: profile?.full_name ?? "—",
      data: formatData(r.created_at),
      valor: formatBRL(valorNumerico),
      valorNumerico,
      servico: r.service ?? "—",
      tipo: mapTipo(r.kind ?? "convenio"),
      status: mapStatus(status),
      faturavel: status === "pendente",
      statusRaw: status,
    };
  });
}

/**
 * Check-out REAL confirmado: lê o evento faturado (forma/pagamento/desconto/
 * acréscimo/total/data) + os billing_items gravados (em formato ItemCheckout).
 * Usado por Visualizar/Imprimir (recibo) e Editar (reabrir a conferência).
 * `null` se o evento não existe.
 */
export async function getCheckoutSalvo(
  code: string,
): Promise<CheckoutSalvo | null> {
  const supabase = await createClient();
  const clinicId = await getActiveClinicId();

  let evtQuery = supabase
    .from("billable_events")
    .select(
      "id, code, amount, net_amount, discount, surcharge, kind, payment_method, checked_out_at, created_at, nf_number, nf_issue_date, nf_due_date, nf_terms, patients(full_name)",
    )
    .eq("code", code);
  if (clinicId) evtQuery = evtQuery.eq("clinic_id", clinicId);
  const { data: evt } = await evtQuery.maybeSingle();
  if (!evt) return null;

  const patient = Array.isArray(evt.patients) ? evt.patients[0] : evt.patients;

  // Itens gravados no check-out (exclui as linhas de ajuste desconto/acréscimo,
  // mostradas separadamente a partir das colunas do evento).
  const { data: rows } = await supabase
    .from("billing_items")
    .select("description, quantity, unit_price, amount, source, code, kind")
    .eq("event_id", evt.id);

  const itens: ItemCheckout[] = (rows ?? [])
    .filter((i) => i.source !== "ajuste")
    .map((i) => ({
      source: ((i.source as string | null) ?? "procedimento") as
        | "procedimento"
        | "exame"
        | "material"
        | "ajuste",
      tipo: i.kind === "material" ? "Material" : "TUSS",
      codigo: (i.code as string | null) ?? "—",
      descricao: (i.description as string | null) ?? "Item",
      qtd: Number(i.quantity ?? 1),
      valor: Number(i.unit_price ?? i.amount ?? 0),
    }));

  const kind = ((evt.kind as string | null) ?? "particular") as
    | "particular"
    | "convenio"
    | "empresa";

  return {
    codigo: (evt.code as string | null) ?? code,
    paciente: patient?.full_name ?? "—",
    data: formatData((evt.checked_out_at ?? evt.created_at) as string | null),
    forma: kind === "convenio" || kind === "empresa" ? kind : "particular",
    pagamento: (evt.payment_method as string | null) ?? null,
    itens,
    desconto: Number(evt.discount ?? 0),
    acrescimo: Number(evt.surcharge ?? 0),
    total: Number(evt.net_amount ?? evt.amount ?? 0),
    nfNumero: (evt.nf_number as string | null) ?? "",
    nfEmissao: ((evt.nf_issue_date as string | null) ?? "").slice(0, 10),
    nfVencimento: ((evt.nf_due_date as string | null) ?? "").slice(0, 10),
    nfPrazos: (evt.nf_terms as string | null) ?? "",
  };
}
