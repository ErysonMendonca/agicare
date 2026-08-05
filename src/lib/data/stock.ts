import { createClient } from "@/lib/supabase/server";
import { requireClinic } from "@/lib/tenant";
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
  /** Código de barras (EAN) — usado na bipagem do atendimento de solicitações. */
  barcode: string | null;
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

/** Formata uma data ISO/Date em MM/AAAA (validade). */
function fmtValidade(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" });
}

/** Lista produtos de estoque: do banco quando configurado, mock no modo demo. */
/**
 * Nomes/Descrições dos produtos JÁ cadastrados na clínica (RLS escopa por
 * clinic_id). Usado pela importação em massa para detectar duplicados contra
 * o catálogo existente. Só nomes ativos e inativos entram (duplicado é
 * duplicado independente do status). Resiliente: erro → lista vazia.
 */
export async function listNomesProdutosClinica(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_products")
    .select("name");
  if (error || !data) return [];
  return data
    .map((p) => (p.name as string | null) ?? "")
    .filter((n) => n !== "");
}

export async function listStockProducts(): Promise<ProdutoEstoque[]> {

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
      barcode: (p.barcode as string | null) ?? null,
    };
  });
}

// ── Produto completo (editor multi-abas) ────────────────────────────
/**
 * Shape completo de um produto para o editor multi-abas (camelCase). Traz o
 * cadastro-mestre inteiro + os campos da migration 0080. As COLEÇÕES-filhas
 * (lotes, códigos de barras, etc.) NÃO vêm aqui — são carregadas à parte.
 */
export type ProdutoCompleto = {
  id: string;
  codigo: string;
  // ── Dados gerais ──
  name: string;
  activeIngredient: string | null;
  presentation: string | null;
  barcode: string | null;
  anvisaRegistration: string | null;
  category: string | null;
  therapeuticClass: string | null;
  unit: string;
  controlledClass: string | null;
  requiresPrescription: boolean;
  manufacturer: string | null;
  supplierId: string | null;
  active: boolean;
  notes: string | null;
  // ── Saldo / financeiro ──
  quantity: number;
  minQuantity: number;
  maxQuantity: number;
  location: string | null;
  lot: string | null;
  expiry: string | null; // ISO cru (para <input type="date">)
  cost: number;
  price: number;
  // ── Classificação (0080) ──
  productType: string | null;
  productGroup: string | null;
  classification: string | null;
  subclassification: string | null;
  port344: boolean;
  cfop: string | null;
  ncm: string | null;
  cest: string | null;
  // ── Controles (0080) ──
  ctrlLoteValidade: boolean;
  ctrlOpme: boolean;
  ctrlNumeroSerie: boolean;
  ctrlMarca: boolean;
  // ── Prescrição (0080) ──
  prescQualquerVia: boolean;
  prescQualquerFrequencia: boolean;
  prescSeNecessario: boolean;
  solicitaSeNecessario: string | null;
  salPrincipioAtivo: string | null;
  // ── Informações adicionais (0080) ──
  infoAltoCusto: boolean;
  infoAltoRisco: boolean;
  infoUrgencia: boolean;
  infoOncologia: boolean;
  infoAntimicrobianoRestrito: boolean;
  infoDva: boolean;
  infoUsoContinuo: boolean;
  infoNaoPadrao: boolean;
  // ── Solução / componentes (0080) ──
  solComponenteDiluido: boolean;
  solComponenteDiluente: boolean;
};

/**
 * Carrega UM produto completo para o editor. Escopo por clínica ativa + RLS de
 * staff. Retorna null quando não encontrado (ou fora do escopo). Só o produto —
 * as coleções-filhas são carregadas separadamente. Em demo, devolve o mock.
 */
export async function getProdutoCompleto(
  productId: string,
): Promise<ProdutoCompleto | null> {
  if (!productId) return null;

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const { data: p, error } = await supabase
    .from("stock_products")
    .select("*")
    .eq("id", productId)
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (error || !p) return null;

  const bool = (v: unknown) => v === true;
  const text = (v: unknown) => (v as string | null) ?? null;

  return {
    id: p.id as string,
    codigo:
      p.code_number != null
        ? String(p.code_number as number).padStart(6, "0")
        : ((p.code as string | null) ?? "—"),
    name: (p.name as string | null) ?? "",
    activeIngredient: text(p.active_ingredient),
    presentation: text(p.presentation),
    barcode: text(p.barcode),
    anvisaRegistration: text(p.anvisa_registration),
    category: text(p.category),
    therapeuticClass: text(p.therapeutic_class),
    unit: (p.unit as string | null) ?? "un",
    controlledClass: text(p.controlled_class),
    requiresPrescription: bool(p.requires_prescription),
    manufacturer: text(p.manufacturer),
    supplierId: text(p.supplier_id),
    active: !!p.active,
    notes: text(p.notes),
    quantity: Number(p.quantity ?? 0),
    minQuantity: Number(p.min_quantity ?? 0),
    maxQuantity: Number(p.max_quantity ?? 0),
    location: text(p.location),
    lot: text(p.lot),
    expiry: text(p.expiry),
    cost: Number(p.cost ?? 0),
    price: Number(p.price ?? 0),
    productType: text(p.product_type),
    productGroup: text(p.product_group),
    classification: text(p.classification),
    subclassification: text(p.subclassification),
    port344: bool(p.port_344),
    cfop: text(p.cfop),
    ncm: text(p.ncm),
    cest: text(p.cest),
    ctrlLoteValidade: bool(p.ctrl_lote_validade),
    ctrlOpme: bool(p.ctrl_opme),
    ctrlNumeroSerie: bool(p.ctrl_numero_serie),
    ctrlMarca: bool(p.ctrl_marca),
    prescQualquerVia: bool(p.presc_qualquer_via),
    prescQualquerFrequencia: bool(p.presc_qualquer_frequencia),
    prescSeNecessario: bool(p.presc_se_necessario),
    solicitaSeNecessario: text(p.solicita_se_necessario),
    salPrincipioAtivo: text(p.sal_principio_ativo),
    infoAltoCusto: bool(p.info_alto_custo),
    infoAltoRisco: bool(p.info_alto_risco),
    infoUrgencia: bool(p.info_urgencia),
    infoOncologia: bool(p.info_oncologia),
    infoAntimicrobianoRestrito: bool(p.info_antimicrobiano_restrito),
    infoDva: bool(p.info_dva),
    infoUsoContinuo: bool(p.info_uso_continuo),
    infoNaoPadrao: bool(p.info_nao_padrao),
    solComponenteDiluido: bool(p.sol_componente_diluido),
    solComponenteDiluente: bool(p.sol_componente_diluente),
  };
}

// ── Fornecedores ───────────────────────────────────────────────────
export type Fornecedor = {
  id: string;
  nome: string;
  cnpj: string;
  contato: string;
  ativo: boolean;
};

export async function listSuppliers(): Promise<Fornecedor[]> {

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
  /** Motivo da recusa (só quando statusRaw === "cancelado"). */
  motivoRecusa: string | null;
};

const KIND_TIPO: Record<string, Tipo> = { prescricao: "Prescrição", setor: "Setor" };
const DISP_STATUS: Record<string, { label: string; tone: Status }> = {
  pendente: { label: "Pendente", tone: "warn" },
  separacao: { label: "Em Separação", tone: "active" },
  concluido: { label: "Concluído", tone: "ok" },
  cancelado: { label: "Recusado", tone: "danger" },
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dispensations")
    .select(
      "id, code, kind, status, urgent, origin_label, origin_name, origin_ref, requested_by, progress, created_at, cancel_reason, dispensation_items(name, quantity, location, barcode, lot, expiry, picked)",
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
      motivoRecusa: (d.cancel_reason as string | null) ?? null,
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

export async function listEntradas(): Promise<EntradaProduto[]> {

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

export async function listCompras(): Promise<SolicitacaoCompra[]> {

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
