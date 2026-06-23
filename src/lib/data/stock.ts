import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { type Status } from "@/components/ui/Badge";

export type StatusEstoque = {
  label: "Crítico" | "Baixo" | "Adequado";
  tone: Status;
};

export type ProdutoEstoque = {
  id: string;
  codigo: string;
  produto: string;
  categoria: string;
  unidade: string;
  saldo: number;
  minimo: number;
  lote: string;
  ativo: boolean;
  status: StatusEstoque;
  /** FINANCEIRO — restrito ao gestor no front. */
  custo: number;
  /** FINANCEIRO — restrito ao gestor no front. */
  preco: number;
  validade: string;
  localizacao: string;
  fornecedor: string;
};

/**
 * Deriva o status do item a partir do saldo vs. mínimo:
 * - saldo < mínimo * 0.5 → Crítico (danger)
 * - saldo < mínimo       → Baixo (warn)
 * - caso contrário       → Adequado (ok)
 */
function derivarStatus(saldo: number, minimo: number): StatusEstoque {
  if (saldo < minimo * 0.5) return { label: "Crítico", tone: "danger" };
  if (saldo < minimo) return { label: "Baixo", tone: "warn" };
  return { label: "Adequado", tone: "ok" };
}

/** Mock usado no modo demo (espelha o Figma). */
const MOCK_RAW: Array<Omit<ProdutoEstoque, "status">> = [
  { id: "1", codigo: "MED-8842", produto: "Dipirona 500mg (ampola)", categoria: "Medicamento", unidade: "ampola", saldo: 12, minimo: 50, lote: "LT-8842", ativo: true, custo: 1.2, preco: 3.5, validade: "10/2026", localizacao: "Prateleira A3", fornecedor: "Cristália" },
  { id: "2", codigo: "SOL-7720", produto: "Soro Fisiológico 0,9% 500ml", categoria: "Solução", unidade: "unidade", saldo: 28, minimo: 40, lote: "LT-7720", ativo: true, custo: 2.8, preco: 6.9, validade: "03/2027", localizacao: "Prateleira B1", fornecedor: "Fresenius" },
  { id: "3", codigo: "MAT-3391", produto: "Luva Cirúrgica nº 7,5", categoria: "Material", unidade: "caixa", saldo: 6, minimo: 30, lote: "LT-3391", ativo: true, custo: 18.0, preco: 39.9, validade: "08/2027", localizacao: "Prateleira C2", fornecedor: "Descarpack" },
  { id: "4", codigo: "MAT-5510", produto: "Seringa 10ml", categoria: "Material", unidade: "unidade", saldo: 9, minimo: 25, lote: "LT-5510", ativo: true, custo: 0.45, preco: 1.2, validade: "12/2026", localizacao: "Prateleira C4", fornecedor: "BD" },
  { id: "5", codigo: "MED-6604", produto: "Paracetamol 750mg (comprimido)", categoria: "Medicamento", unidade: "comprimido", saldo: 180, minimo: 100, lote: "LT-6604", ativo: true, custo: 0.18, preco: 0.5, validade: "06/2027", localizacao: "Prateleira A1", fornecedor: "EMS" },
];

const MOCK: ProdutoEstoque[] = MOCK_RAW.map((p) => ({
  ...p,
  status: derivarStatus(p.saldo, p.minimo),
}));

/** Formata uma data ISO/Date em MM/AAAA (validade). */
function fmtValidade(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" });
}

/** Lista produtos de estoque: do banco quando configurado, mock no modo demo. */
export async function listStockProducts(): Promise<ProdutoEstoque[]> {
  if (isDemoMode()) return MOCK;

  const supabase = await createClient();
  // Tenta com o embed de fornecedor (0006); se falhar (migration não aplicada),
  // cai para select('*') puro — resiliente a colunas/relacionamentos ausentes.
  let res = await supabase
    .from("stock_products")
    .select("*, suppliers(name)")
    .order("created_at", { ascending: false });

  if (res.error) {
    res = await supabase
      .from("stock_products")
      .select("*")
      .order("created_at", { ascending: false });
  }

  const { data, error } = res;
  if (error || !data) return [];

  return data.map((p) => {
    const saldo = Number(p.quantity ?? 0);
    const minimo = Number(p.min_quantity ?? 0);
    const sup = Array.isArray(p.suppliers) ? p.suppliers[0] : p.suppliers;
    return {
      id: p.id as string,
      // Código = nº sequencial por clínica (0058) zero-pad a 6; fallback ao code legado.
      codigo:
        p.code_number != null
          ? String(p.code_number as number).padStart(6, "0")
          : ((p.code as string | null) ?? "—"),
      produto: (p.name as string | null) ?? "",
      categoria: (p.category as string | null) ?? "—",
      unidade: (p.unit as string | null) ?? "—",
      saldo,
      minimo,
      lote: (p.lot as string | null) ?? "—",
      ativo: !!p.active,
      status: derivarStatus(saldo, minimo),
      custo: Number(p.cost ?? 0),
      preco: Number(p.price ?? 0),
      validade: fmtValidade((p.expiry as string | null) ?? null),
      localizacao: (p.location as string | null) ?? "—",
      fornecedor: (sup?.name as string | null) ?? "—",
    };
  });
}

// ── Fornecedores ───────────────────────────────────────────────────
export type Fornecedor = {
  id: string;
  nome: string;
  cnpj: string;
  contato: string;
  ativo: boolean;
};

const MOCK_FORNECEDORES: Fornecedor[] = [
  { id: "1", nome: "Cristália Produtos Químicos", cnpj: "44.734.671/0001-51", contato: "Vendas — (19) 3863-9500", ativo: true },
  { id: "2", nome: "Fresenius Kabi", cnpj: "49.324.221/0001-04", contato: "Comercial — (11) 4197-7100", ativo: true },
  { id: "3", nome: "Descarpack Descartáveis", cnpj: "01.376.989/0001-50", contato: "SAC — (11) 3622-8200", ativo: true },
  { id: "4", nome: "EMS Pharma", cnpj: "57.507.378/0003-65", contato: "Vendas — (19) 3887-9000", ativo: false },
];

export async function listSuppliers(): Promise<Fornecedor[]> {
  if (isDemoMode()) return MOCK_FORNECEDORES;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, cnpj, contact, active")
    .order("name", { ascending: true });

  if (error || !data) return [];
  return data.map((s) => ({
    id: s.id as string,
    nome: (s.name as string | null) ?? "—",
    cnpj: (s.cnpj as string | null) ?? "—",
    contato: (s.contact as string | null) ?? "—",
    ativo: !!s.active,
  }));
}

// ── Dispensação ────────────────────────────────────────────────────
export type Tipo = "Prescrição" | "Setor";

export type DispensacaoItem = {
  nome: string;
  quantidade: string;
  localizacao: string;
  codigoBarras: string;
  lote: string;
  validade: string;
  separado: boolean;
};

export type Dispensacao = {
  id: string;
  codigo: string;
  tipo: Tipo;
  status: { label: string; tone: Status };
  statusRaw: "pendente" | "separacao" | "concluido" | "cancelado";
  urgente: boolean;
  progresso: number;
  origem: { rotulo: string; nome: string; identificador: string };
  solicitante: { nome: string; data: string };
  itens: DispensacaoItem[];
};

const MOCK_DISPENSACOES: Dispensacao[] = [
  {
    id: "d1", codigo: "PRESC-001", tipo: "Prescrição",
    status: { label: "Pendente", tone: "warn" }, statusRaw: "pendente", urgente: true, progresso: 0,
    origem: { rotulo: "Paciente", nome: "Maria Silva", identificador: "PAC-2025-0123" },
    solicitante: { nome: "Dr. João Santos", data: "15/01/2025 14:30" },
    itens: [
      { nome: "Dipirona 500mg", quantidade: "3 ampolas", localizacao: "Prateleira A3", codigoBarras: "7891234560012", lote: "LT-8842", validade: "10/2026", separado: false },
      { nome: "Soro Fisiológico 0,9% 500ml", quantidade: "2 unidades", localizacao: "Prateleira B1", codigoBarras: "7891234560029", lote: "LT-7720", validade: "03/2027", separado: false },
    ],
  },
  {
    id: "d2", codigo: "PRESC-002", tipo: "Prescrição",
    status: { label: "Pendente", tone: "warn" }, statusRaw: "pendente", urgente: false, progresso: 0,
    origem: { rotulo: "Paciente", nome: "João Pedro Oliveira", identificador: "PAC-2025-0098" },
    solicitante: { nome: "Dra. Ana Costa", data: "15/01/2025 13:10" },
    itens: [
      { nome: "Amoxicilina 875mg", quantidade: "14 comprimidos", localizacao: "Prateleira A2", codigoBarras: "7891234560036", lote: "LT-1180", validade: "01/2027", separado: false },
      { nome: "Paracetamol 750mg", quantidade: "10 comprimidos", localizacao: "Prateleira A1", codigoBarras: "7891234560043", lote: "LT-6604", validade: "06/2027", separado: false },
    ],
  },
  {
    id: "d3", codigo: "REQ-014", tipo: "Setor",
    status: { label: "Em Separação", tone: "active" }, statusRaw: "separacao", urgente: false, progresso: 50,
    origem: { rotulo: "Setor", nome: "UTI Adulto", identificador: "SET-UTI-01" },
    solicitante: { nome: "Enf. Carla Menezes", data: "15/01/2025 11:45" },
    itens: [
      { nome: "Luva Cirúrgica nº 7,5", quantidade: "5 caixas", localizacao: "Prateleira C2", codigoBarras: "7891234560050", lote: "LT-3391", validade: "08/2027", separado: true },
      { nome: "Seringa 10ml", quantidade: "50 unidades", localizacao: "Prateleira C4", codigoBarras: "7891234560067", lote: "LT-5510", validade: "12/2026", separado: false },
    ],
  },
  {
    id: "d4", codigo: "REQ-015", tipo: "Setor",
    status: { label: "Pendente", tone: "warn" }, statusRaw: "pendente", urgente: false, progresso: 0,
    origem: { rotulo: "Setor", nome: "Centro Cirúrgico", identificador: "SET-CC-02" },
    solicitante: { nome: "Enf. Roberto Lima", data: "15/01/2025 10:20" },
    itens: [
      { nome: "Compressa de Gaze Estéril", quantidade: "20 pacotes", localizacao: "Prateleira D1", codigoBarras: "7891234560074", lote: "LT-9921", validade: "05/2028", separado: false },
      { nome: "Álcool 70% 1L", quantidade: "8 frascos", localizacao: "Prateleira D3", codigoBarras: "7891234560081", lote: "LT-4410", validade: "11/2026", separado: false },
    ],
  },
];

const KIND_TIPO: Record<string, Tipo> = { prescricao: "Prescrição", setor: "Setor" };
const DISP_STATUS: Record<string, { label: string; tone: Status }> = {
  pendente: { label: "Pendente", tone: "warn" },
  separacao: { label: "Em Separação", tone: "active" },
  concluido: { label: "Concluído", tone: "ok" },
  cancelado: { label: "Cancelado", tone: "danger" },
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

export async function listDispensacoes(): Promise<Dispensacao[]> {
  if (isDemoMode()) return MOCK_DISPENSACOES;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dispensations")
    .select(
      "id, code, kind, status, urgent, origin_label, origin_name, origin_ref, requested_by, progress, created_at, dispensation_items(name, quantity, location, barcode, lot, expiry, picked)",
    )
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((d) => {
    const statusRaw = (d.status as Dispensacao["statusRaw"]) ?? "pendente";
    const itensRaw = Array.isArray(d.dispensation_items) ? d.dispensation_items : [];
    return {
      id: d.id as string,
      codigo: (d.code as string | null) ?? "—",
      tipo: KIND_TIPO[(d.kind as string) ?? "prescricao"] ?? "Prescrição",
      status: DISP_STATUS[statusRaw] ?? DISP_STATUS.pendente,
      statusRaw,
      urgente: !!d.urgent,
      progresso: Number(d.progress ?? 0),
      origem: {
        rotulo: (d.origin_label as string | null) ?? "—",
        nome: (d.origin_name as string | null) ?? "—",
        identificador: (d.origin_ref as string | null) ?? "—",
      },
      solicitante: {
        nome: (d.requested_by as string | null) ?? "—",
        data: fmtDataHora((d.created_at as string | null) ?? null),
      },
      itens: itensRaw.map((it) => ({
        nome: (it.name as string | null) ?? "—",
        quantidade: (it.quantity as string | null) ?? "—",
        localizacao: (it.location as string | null) ?? "—",
        codigoBarras: (it.barcode as string | null) ?? "—",
        lote: (it.lot as string | null) ?? "—",
        validade: fmtValidade((it.expiry as string | null) ?? null),
        separado: !!it.picked,
      })),
    };
  });
}

// ── Itens prescritos do paciente (origem da Dispensação por prescrição) ──
export type ItemPrescrito = {
  /** Item prescrito de origem (prescription_items.id) — base do vínculo anti-duplicidade. */
  prescriptionItemId: string;
  /** Vínculo ao catálogo de estoque (null = medicamento sem produto cadastrado). */
  productId: string | null;
  nome: string;
  concentracao: string | null;
  posologia: string | null;
  unidade: string;
  /** Saldo atual no estoque (informativo); null quando sem vínculo. */
  saldo: number | null;
};

const MOCK_PRESCRITOS: ItemPrescrito[] = [
  { prescriptionItemId: "pi-1", productId: "1", nome: "Dipirona 500mg (ampola)", concentracao: "500mg", posologia: "1 ampola 6/6h", unidade: "ampola", saldo: 12 },
  { prescriptionItemId: "pi-2", productId: "5", nome: "Paracetamol 750mg (comprimido)", concentracao: "750mg", posologia: "1 comprimido 8/8h", unidade: "comprimido", saldo: 180 },
];

/**
 * Medicamentos prescritos a um paciente (join prescriptions → prescription_items),
 * com o vínculo ao catálogo de estoque (stock_products) quando existir — base do
 * pré-preenchimento da Dispensação por prescrição. Lê pelo cliente de servidor
 * (RLS): só staff clínico da clínica ativa enxerga prescrições (dado sensível,
 * LGPD); demais papéis recebem lista vazia (fail-safe). Varre as prescrições mais
 * recentes e deduplica por medicamento (mantém a ocorrência mais recente).
 *
 * ANTI-DUPLICIDADE (0043): exclui os itens prescritos que JÁ viraram dispensação
 * (têm vínculo em dispensation_items.prescription_item_id de uma dispensação
 * não-cancelada). Sem isso, a prescrição reapareceria a cada abertura do modal,
 * permitindo dispensar — e debitar o estoque — o mesmo item N vezes.
 */
export async function listItensPrescritosPaciente(
  patientId: string,
): Promise<ItemPrescrito[]> {
  if (isDemoMode()) return MOCK_PRESCRITOS;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prescriptions")
    .select(
      "created_at, prescription_items(id, product_id, name, concentration, posology, stock_products(unit, quantity))",
    )
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) return [];

  // IDs de todos os itens prescritos vistos (base da consulta anti-duplicidade).
  const todosIds: string[] = [];
  for (const presc of data) {
    const linhas = Array.isArray(presc.prescription_items)
      ? presc.prescription_items
      : [];
    for (const it of linhas) {
      if (it.id) todosIds.push(it.id as string);
    }
  }

  // Itens prescritos já dispensados (dispensação não-cancelada). Resiliente:
  // se a coluna 0043 ainda não existir, a consulta falha e seguimos sem o
  // filtro (degrada para o comportamento anterior, sem quebrar a tela).
  const dispensados = new Set<string>();
  if (todosIds.length > 0) {
    const { data: jaDisp } = await supabase
      .from("dispensation_items")
      .select("prescription_item_id, dispensations!inner(status)")
      .in("prescription_item_id", todosIds)
      .neq("dispensations.status", "cancelado");
    for (const row of jaDisp ?? []) {
      const pid = row.prescription_item_id as string | null;
      if (pid) dispensados.add(pid);
    }
  }

  const vistos = new Set<string>();
  const itens: ItemPrescrito[] = [];
  for (const presc of data) {
    const linhas = Array.isArray(presc.prescription_items)
      ? presc.prescription_items
      : [];
    for (const it of linhas) {
      const id = (it.id as string | null) ?? null;
      if (!id) continue;
      // ANTI-DUPLICIDADE: pula o que já virou dispensação.
      if (dispensados.has(id)) continue;
      const productId = (it.product_id as string | null) ?? null;
      const nome = (it.name as string | null) ?? "—";
      // Deduplica por vínculo de produto OU nome (o mesmo medicamento pode
      // aparecer em prescrições diferentes — fica o da mais recente).
      const chave = productId ?? `nome:${nome.toLowerCase()}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const prod = Array.isArray(it.stock_products)
        ? it.stock_products[0]
        : it.stock_products;
      itens.push({
        prescriptionItemId: id,
        productId,
        nome,
        concentracao: (it.concentration as string | null) ?? null,
        posologia: (it.posology as string | null) ?? null,
        unidade: (prod?.unit as string | null) ?? "un",
        saldo: prod ? Number(prod.quantity ?? 0) : null,
      });
    }
  }
  return itens;
}

// ── Entradas de produtos (NF) ───────────────────────────────────────
export type EntradaProduto = {
  id: string;
  nota: string;
  fornecedor: string;
  data: string;
  itens: number;
  valorTotal: number;
};

const MOCK_ENTRADAS: EntradaProduto[] = [
  { id: "e1", nota: "NF-e 0012345", fornecedor: "Cristália Produtos Químicos", data: "12/01/2025", itens: 8, valorTotal: 2480.0 },
  { id: "e2", nota: "NF-e 0009981", fornecedor: "Descarpack Descartáveis", data: "08/01/2025", itens: 3, valorTotal: 1196.7 },
  { id: "e3", nota: "NF-e 0010220", fornecedor: "Fresenius Kabi", data: "03/01/2025", itens: 5, valorTotal: 845.5 },
];

export async function listEntradas(): Promise<EntradaProduto[]> {
  if (isDemoMode()) return MOCK_ENTRADAS;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, invoice_number, total_value, created_at, type, suppliers(name)")
    .eq("type", "entrada")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  // Agrega por Nota Fiscal: cada movimento 'entrada' é UM item da NF (0038).
  // itens = nº de movimentos da NF; valorTotal = soma (o total fica só no 1º).
  // Movimentos sem invoice_number caem em grupos próprios (chave = id).
  const grupos = new Map<string, EntradaProduto>();
  for (const m of data) {
    const sup = Array.isArray(m.suppliers) ? m.suppliers[0] : m.suppliers;
    const nf = (m.invoice_number as string | null) ?? null;
    const chave = nf ?? `__${m.id as string}`;
    const existente = grupos.get(chave);
    if (existente) {
      existente.itens += 1;
      existente.valorTotal += Number(m.total_value ?? 0);
    } else {
      grupos.set(chave, {
        id: m.id as string,
        nota: nf ?? "—",
        fornecedor: (sup?.name as string | null) ?? "—",
        data: fmtDataHora((m.created_at as string | null) ?? null),
        itens: 1,
        valorTotal: Number(m.total_value ?? 0),
      });
    }
  }
  return Array.from(grupos.values());
}

// ── Compras (solicitações + cotações) ───────────────────────────────
export type Cotacao = {
  fornecedor: string;
  valor: number;
  prazo: string;
  /** Nome do arquivo anexado (rótulo de exibição). */
  anexo: string;
  /** Caminho do PDF no bucket privado 'cotacoes' (null = sem anexo). */
  anexoPath: string | null;
  aprovada: boolean | null;
};

export type SolicitacaoCompra = {
  id: string;
  codigo: string;
  produto: string;
  quantidade: string;
  justificativa: string;
  status: { label: string; tone: Status };
  statusRaw: "solicitado" | "cotacao" | "aprovado" | "reprovado";
  cotacoes: Cotacao[];
};

const COMPRA_STATUS: Record<string, { label: string; tone: Status }> = {
  solicitado: { label: "Solicitado", tone: "wait" },
  cotacao: { label: "Em Cotação", tone: "active" },
  aprovado: { label: "Aprovado", tone: "ok" },
  reprovado: { label: "Reprovado", tone: "danger" },
};

const MOCK_COMPRAS: SolicitacaoCompra[] = [
  {
    id: "c1", codigo: "SC-2025-001", produto: "Luva Cirúrgica nº 7,5", quantidade: "40 caixas",
    justificativa: "Saldo crítico (6 caixas) abaixo do mínimo de 30. Alta demanda no Centro Cirúrgico.",
    status: COMPRA_STATUS.cotacao, statusRaw: "cotacao",
    cotacoes: [
      { fornecedor: "Descarpack Descartáveis", valor: 720.0, prazo: "5 dias úteis", anexo: "cotacao-descarpack.pdf", anexoPath: null, aprovada: null },
      { fornecedor: "BD Brasil", valor: 760.0, prazo: "3 dias úteis", anexo: "cotacao-bd.pdf", anexoPath: null, aprovada: null },
    ],
  },
  {
    id: "c2", codigo: "SC-2025-002", produto: "Soro Fisiológico 0,9% 500ml", quantidade: "120 unidades",
    justificativa: "Reposição programada — saldo abaixo do mínimo.",
    status: COMPRA_STATUS.solicitado, statusRaw: "solicitado",
    cotacoes: [],
  },
];

export async function listCompras(): Promise<SolicitacaoCompra[]> {
  if (isDemoMode()) return MOCK_COMPRAS;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_requests")
    .select(
      "id, code, product_name, quantity, justification, status, quotations(supplier_name, amount, lead_time, attachment_url, attachment_path, approved)",
    )
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map((r) => {
    const statusRaw = (r.status as SolicitacaoCompra["statusRaw"]) ?? "solicitado";
    const cotsRaw = Array.isArray(r.quotations) ? r.quotations : [];
    return {
      id: r.id as string,
      codigo: (r.code as string | null) ?? "—",
      produto: (r.product_name as string | null) ?? "—",
      quantidade: (r.quantity as string | null) ?? "—",
      justificativa: (r.justification as string | null) ?? "—",
      status: COMPRA_STATUS[statusRaw] ?? COMPRA_STATUS.solicitado,
      statusRaw,
      cotacoes: cotsRaw.map((c) => ({
        fornecedor: (c.supplier_name as string | null) ?? "—",
        valor: Number(c.amount ?? 0),
        prazo: (c.lead_time as string | null) ?? "—",
        anexo: (c.attachment_url as string | null) ?? "—",
        anexoPath: (c.attachment_path as string | null) ?? null,
        aprovada: (c.approved as boolean | null) ?? null,
      })),
    };
  });
}

// ── Inventário ──────────────────────────────────────────────────────
export type ItemInventario = {
  id: string;
  produto: string;
  categoria: string;
  sistema: number;
  contagem1: number | null;
  contagem2: number | null;
  contagem3: number | null;
};

/** Gera a base de itens de inventário a partir dos produtos atuais. */
export async function listItensInventario(): Promise<ItemInventario[]> {
  const produtos = await listStockProducts();
  return produtos.map((p) => ({
    id: p.id,
    produto: p.produto,
    categoria: p.categoria,
    sistema: p.saldo,
    contagem1: null,
    contagem2: null,
    contagem3: null,
  }));
}

/** Linha persistida de conferência (inventory_counts). */
export type ContagemLinha = {
  id: string;
  produto: string;
  sistema: number;
  contagem1: number | null;
  contagem2: number | null;
  contagem3: number | null;
};

/** Inventário aberto com suas contagens (snapshot). */
export type InventarioAberto = {
  id: string;
  codigo: string;
  tipo: "geral" | "parcial";
  categoria: string | null;
  criadoEm: string;
  itens: ContagemLinha[];
};

/** Lista inventários ABERTOS com as contagens persistidas. Vazio em demo. */
export async function listInventarios(): Promise<InventarioAberto[]> {
  if (isDemoMode()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventories")
    .select(
      "id, code, kind, category, created_at, status, inventory_counts(id, product_name, system_qty, count_1, count_2, count_3)",
    )
    .eq("status", "aberto")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((inv) => {
    const itensRaw = Array.isArray(inv.inventory_counts)
      ? inv.inventory_counts
      : [];
    return {
      id: inv.id as string,
      codigo: (inv.code as string | null) ?? "—",
      tipo: ((inv.kind as string) ?? "geral") as "geral" | "parcial",
      categoria: (inv.category as string | null) ?? null,
      criadoEm: fmtDataHora((inv.created_at as string | null) ?? null),
      itens: itensRaw
        .map((c) => ({
          id: c.id as string,
          produto: (c.product_name as string | null) ?? "—",
          sistema: Number(c.system_qty ?? 0),
          contagem1: c.count_1 === null ? null : Number(c.count_1),
          contagem2: c.count_2 === null ? null : Number(c.count_2),
          contagem3: c.count_3 === null ? null : Number(c.count_3),
        }))
        .sort((a, b) => a.produto.localeCompare(b.produto)),
    };
  });
}
