import { createClient } from "@/lib/supabase/server";
import { getActiveClinicId } from "@/lib/tenant";
import { type Status } from "@/components/ui/Badge";

export type Convenio = "Convênio" | "Particular";

export type Evento = {
  codigo: string;
  /** Nº do atendimento (queue_entries.attendance_code) — identificador exibido
   * no card no lugar do código interno do evento; null = sem vínculo (legado). */
  atendimentoCodigo: string | null;
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
  /** Nº do atendimento (queue_entries.attendance_code); null = sem vínculo (legado/avulso). */
  atendimentoCodigo: string | null;
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

/** Material (produto de estoque) vinculado ao procedimento (catálogo). */
export type MaterialDoItem = { nome: string; unidade: string; quantidade: number };

/** Instrumental vinculado ao procedimento (catálogo, com esterilização). */
export type InstrumentoDoItem = {
  nome: string;
  sterilizationMethod: string | null;
  validityDate: string | null;
  lotCode: string | null;
};

export type ItemCheckout = {
  /** Origem do item (define cor/rótulo na UI). */
  source: "procedimento" | "exame" | "material" | "ajuste";
  tipo: "TUSS" | "Material";
  codigo: string;
  descricao: string;
  qtd: number;
  valor: number;
  /** UUID do procedimento no catálogo (0122) — usado para religar material/
   *  instrumental sem depender do código TUSS (frágil quando não há um real).
   *  Só quando source === "procedimento"; null = sem procedimento do catálogo casado. */
  procedureId?: string | null;
  /** Material do procedimento (catálogo) — só quando source === "procedimento". */
  materiais?: MaterialDoItem[];
  /** Instrumental do procedimento (catálogo) — idem. */
  instrumentos?: InstrumentoDoItem[];
};

export type CheckoutData = {
  /** UUID interno do evento (necessário para gravar billing_items). */
  eventId: string | null;
  itens: ItemCheckout[];
  /** Nº do atendimento (queue_entries.attendance_code); null = sem vínculo (legado/avulso). */
  atendimentoCodigo: string | null;
};

/** Objeto do join aninhado pode vir como objeto único ou array — normaliza. */
function one<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

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
    return { eventId: null, itens: [], atendimentoCodigo: null };
  }

  const valorEvento = Number(evt.amount ?? fallbackValor);
  const servico = evt.service ?? fallbackServico;
  const itens: ItemCheckout[] = [];
  // Nº do atendimento (queue_entries.attendance_code) — vem junto da execução
  // do procedimento (procedure_executions.queue_entry_id, 0073).
  let atendimentoCodigo: string | null = null;
  // Item + procedure_id (catálogo) de cada procedimento cobrado, para depois
  // anexar material/instrumental — mantém a referência ao objeto já inserido
  // em `itens` (mutação no lugar, sem precisar re-indexar por descrição/código).
  const procItens: { item: ItemCheckout; procedureId: string | null }[] = [];

  // TODOS os procedimentos lançados no atendimento e vinculados a este evento
  // (billable_event_id) — cada um vira uma linha de cobrança no check-out.
  const clinicId = await getActiveClinicId();
  let execQuery = supabase
    .from("procedure_executions")
    .select("amount, procedures(id, code, name), queue_entries(attendance_code)")
    .eq("billable_event_id", evt.id);
  // Defesa em profundidade: além do RLS, escopa pela clínica ativa.
  if (clinicId) execQuery = execQuery.eq("clinic_id", clinicId);
  const { data: execs } = await execQuery.order("created_at", {
    ascending: true,
  });

  if (execs && execs.length > 0) {
    for (const ex of execs) {
      const p = one(ex.procedures) as
        | { id: string | null; code: string | null; name: string | null }
        | undefined;
      const qe = one(ex.queue_entries) as
        | { attendance_code: string | null }
        | undefined;
      if (!atendimentoCodigo && qe?.attendance_code) {
        atendimentoCodigo = qe.attendance_code;
      }
      const item: ItemCheckout = {
        source: "procedimento",
        tipo: "TUSS",
        codigo: p?.code ?? "10101012",
        descricao: p?.name ?? servico,
        qtd: 1,
        valor: Math.round(Number(ex.amount ?? 0) * 100) / 100,
        procedureId: p?.id ?? null,
      };
      itens.push(item);
      procItens.push({ item, procedureId: p?.id ?? null });
    }
  } else {
    // Fallback (eventos legados, sem execuções vinculadas): procedimento
    // principal casado pelo nome do serviço, como antes.
    const { data: proc } = await supabase
      .from("procedures")
      .select("id, code, name, price")
      .ilike("name", servico)
      .limit(1)
      .maybeSingle();

    const procValor = proc?.price ? Number(proc.price) : valorEvento;
    const item: ItemCheckout = {
      source: "procedimento",
      tipo: "TUSS",
      codigo: proc?.code ?? "10101012",
      descricao: proc?.name ?? servico,
      qtd: 1,
      valor: Math.round(procValor * 100) / 100,
      procedureId: proc?.id ?? null,
    };
    itens.push(item);
    procItens.push({ item, procedureId: proc?.id ?? null });
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

  // Material/instrumental vinculados ao(s) procedimento(s) cobrado(s) (catálogo,
  // 0117/0121) — anexa aos itens de origem "procedimento". Isolado: se a
  // migration não estiver aplicada, a leitura falha sem derrubar o check-out.
  const procedureIds = Array.from(
    new Set(
      procItens.map((p) => p.procedureId).filter((id): id is string => !!id),
    ),
  );
  if (procedureIds.length > 0) {
    const [instrRes, matsRes] = await Promise.all([
      supabase
        .from("procedure_instruments")
        .select(
          "procedure_id, attendance_options(label, sterilization_method, validity_date, lot_code)",
        )
        .in("procedure_id", procedureIds),
      supabase
        .from("procedure_materials")
        .select("procedure_id, quantity, stock_products(name, unit)")
        .in("procedure_id", procedureIds),
    ]);

    const instrumentosPorProc = new Map<string, InstrumentoDoItem[]>();
    const materiaisPorProc = new Map<string, MaterialDoItem[]>();

    for (const r of (instrRes.data ?? []) as {
      procedure_id: string;
      attendance_options:
        | { label: string; sterilization_method: string | null; validity_date: string | null; lot_code: string | null }
        | { label: string; sterilization_method: string | null; validity_date: string | null; lot_code: string | null }[]
        | null;
    }[]) {
      const opt = one(r.attendance_options);
      if (!opt) continue;
      const lista = instrumentosPorProc.get(r.procedure_id) ?? [];
      lista.push({
        nome: opt.label,
        sterilizationMethod: opt.sterilization_method ?? null,
        validityDate: opt.validity_date ?? null,
        lotCode: opt.lot_code ?? null,
      });
      instrumentosPorProc.set(r.procedure_id, lista);
    }

    for (const r of (matsRes.data ?? []) as {
      procedure_id: string;
      quantity: number | null;
      stock_products: { name: string; unit: string | null } | { name: string; unit: string | null }[] | null;
    }[]) {
      const prod = one(r.stock_products);
      if (!prod) continue;
      const lista = materiaisPorProc.get(r.procedure_id) ?? [];
      lista.push({
        nome: prod.name,
        unidade: prod.unit ?? "un",
        quantidade: Number(r.quantity ?? 1),
      });
      materiaisPorProc.set(r.procedure_id, lista);
    }

    for (const { item, procedureId } of procItens) {
      if (!procedureId) continue;
      item.materiais = materiaisPorProc.get(procedureId) ?? [];
      item.instrumentos = instrumentosPorProc.get(procedureId) ?? [];
    }
  }

  return { eventId: evt.id, itens, atendimentoCodigo };
}

/** Lista eventos faturáveis: do banco quando configurado, mock no modo demo. */
export async function listBillableEvents(): Promise<Evento[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billable_events")
    .select(
      "id, code, kind, service, amount, status, created_at, patients(full_name), professionals(profiles(full_name))",
    )
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  // Nº do atendimento de cada evento (queue_entries.attendance_code), buscado
  // em lote via procedure_executions.billable_event_id — mesmo caminho usado
  // no check-out (getCheckoutData), aqui para toda a lista de uma vez.
  const eventIds = data.map((r) => r.id as string);
  const atendimentoPorEvento = new Map<string, string>();
  if (eventIds.length > 0) {
    const { data: execs } = await supabase
      .from("procedure_executions")
      .select("billable_event_id, queue_entries(attendance_code)")
      .in("billable_event_id", eventIds)
      .order("created_at", { ascending: true });
    for (const ex of execs ?? []) {
      const eventId = ex.billable_event_id as string | null;
      if (!eventId || atendimentoPorEvento.has(eventId)) continue;
      const qe = one(ex.queue_entries) as
        | { attendance_code: string | null }
        | undefined;
      if (qe?.attendance_code) atendimentoPorEvento.set(eventId, qe.attendance_code);
    }
  }

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
      atendimentoCodigo: atendimentoPorEvento.get(r.id as string) ?? null,
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
    .select("description, quantity, unit_price, amount, source, code, kind, procedure_id")
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
      procedureId: (i.procedure_id as string | null) ?? null,
    }));

  // Nº do atendimento: via procedure_executions ligados a este evento (o vínculo
  // (queue_entry_id, 0073) sobrevive à regravação de billing_items no check-out).
  let atendimentoCodigo: string | null = null;
  let execQuery = supabase
    .from("procedure_executions")
    .select("queue_entries(attendance_code)")
    .eq("billable_event_id", evt.id);
  if (clinicId) execQuery = execQuery.eq("clinic_id", clinicId);
  const { data: execRows } = await execQuery.limit(5);
  for (const ex of execRows ?? []) {
    const qe = one(ex.queue_entries) as { attendance_code: string | null } | undefined;
    if (qe?.attendance_code) {
      atendimentoCodigo = qe.attendance_code;
      break;
    }
  }

  // Material/instrumental do(s) procedimento(s) cobrado(s) (catálogo). Prioriza
  // o procedure_id gravado direto no item (0122); só cai no casamento por
  // código TUSS para itens LEGADOS (check-out feito antes da 0122).
  const itensSemProcedureId = itens.filter(
    (i) => i.source === "procedimento" && !i.procedureId && i.codigo !== "—",
  );
  if (itensSemProcedureId.length > 0) {
    const codigosProc = Array.from(
      new Set(itensSemProcedureId.map((i) => i.codigo)),
    );
    const { data: procs } = await supabase
      .from("procedures")
      .select("id, code")
      .in("code", codigosProc);
    const idPorCodigo = new Map(
      (procs ?? []).map((p) => [p.code as string, p.id as string]),
    );
    for (const item of itensSemProcedureId) {
      item.procedureId = idPorCodigo.get(item.codigo) ?? null;
    }
  }

  {
    const procedureIds = Array.from(
      new Set(
        itens
          .filter((i) => i.source === "procedimento")
          .map((i) => i.procedureId)
          .filter((id): id is string => !!id),
      ),
    );

    if (procedureIds.length > 0) {
      const [instrRes, matsRes] = await Promise.all([
        supabase
          .from("procedure_instruments")
          .select(
            "procedure_id, attendance_options(label, sterilization_method, validity_date, lot_code)",
          )
          .in("procedure_id", procedureIds),
        supabase
          .from("procedure_materials")
          .select("procedure_id, quantity, stock_products(name, unit)")
          .in("procedure_id", procedureIds),
      ]);

      const instrumentosPorProc = new Map<string, InstrumentoDoItem[]>();
      const materiaisPorProc = new Map<string, MaterialDoItem[]>();

      for (const r of (instrRes.data ?? []) as {
        procedure_id: string;
        attendance_options:
          | { label: string; sterilization_method: string | null; validity_date: string | null; lot_code: string | null }
          | { label: string; sterilization_method: string | null; validity_date: string | null; lot_code: string | null }[]
          | null;
      }[]) {
        const opt = one(r.attendance_options);
        if (!opt) continue;
        const lista = instrumentosPorProc.get(r.procedure_id) ?? [];
        lista.push({
          nome: opt.label,
          sterilizationMethod: opt.sterilization_method ?? null,
          validityDate: opt.validity_date ?? null,
          lotCode: opt.lot_code ?? null,
        });
        instrumentosPorProc.set(r.procedure_id, lista);
      }

      for (const r of (matsRes.data ?? []) as {
        procedure_id: string;
        quantity: number | null;
        stock_products: { name: string; unit: string | null } | { name: string; unit: string | null }[] | null;
      }[]) {
        const prod = one(r.stock_products);
        if (!prod) continue;
        const lista = materiaisPorProc.get(r.procedure_id) ?? [];
        lista.push({
          nome: prod.name,
          unidade: prod.unit ?? "un",
          quantidade: Number(r.quantity ?? 1),
        });
        materiaisPorProc.set(r.procedure_id, lista);
      }

      for (const item of itens) {
        if (item.source !== "procedimento" || !item.procedureId) continue;
        item.materiais = materiaisPorProc.get(item.procedureId) ?? [];
        item.instrumentos = instrumentosPorProc.get(item.procedureId) ?? [];
      }
    }
  }

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
    atendimentoCodigo,
    nfNumero: (evt.nf_number as string | null) ?? "",
    nfEmissao: ((evt.nf_issue_date as string | null) ?? "").slice(0, 10),
    nfVencimento: ((evt.nf_due_date as string | null) ?? "").slice(0, 10),
    nfPrazos: (evt.nf_terms as string | null) ?? "",
  };
}
