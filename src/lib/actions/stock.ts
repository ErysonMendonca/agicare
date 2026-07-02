"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { requireClinic } from "@/lib/tenant";
import { requireClinico } from "@/lib/auth";
import {
  listItensPrescritosPaciente,
  type ItemPrescrito,
} from "@/lib/data/stock";

export type ActionState = { error?: string; ok?: boolean } | undefined;

function revalidateEstoque() {
  revalidatePath("/estoque");
}

// ── Cadastro de produto ─────────────────────────────────────────────
const numeroOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v !== "" ? Number(v.replace(",", ".")) : 0))
  .pipe(z.number().min(0, "Valor inválido."));

const produtoSchema = z.object({
  // `code` NÃO vem do form: é gerado automático (sequencial por clínica) pelo
  // trigger 0058. Aqui ficam só os dados do cadastro-mestre do produto.
  name: z.string().trim().min(2, "Nome muito curto."),
  active_ingredient: z.string().trim().optional().or(z.literal("")),
  presentation: z.string().trim().optional().or(z.literal("")),
  barcode: z.string().trim().optional().or(z.literal("")),
  anvisa_registration: z.string().trim().optional().or(z.literal("")),
  category: z.string().trim().optional().or(z.literal("")),
  therapeutic_class: z.string().trim().optional().or(z.literal("")),
  unit: z.string().trim().optional().or(z.literal("")),
  controlled_class: z.string().trim().optional().or(z.literal("")),
  requires_prescription: z.string().optional(),
  quantity: numeroOpcional,
  min_quantity: numeroOpcional,
  max_quantity: numeroOpcional,
  location: z.string().trim().optional().or(z.literal("")),
  cost: numeroOpcional,
  price: numeroOpcional,
  manufacturer: z.string().trim().optional().or(z.literal("")),
  supplier_id: z.string().trim().optional().or(z.literal("")),
  active: z.string().optional(),
  notes: z.string().trim().optional().or(z.literal("")),
});

/** Cria um produto de estoque. Valida com Zod e insere via cliente de servidor (RLS staff). */
export async function createStockProduct(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = produtoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (isDemoMode()) return { ok: true };

  const d = parsed.data;
  const clinicId = await requireClinic();
  const supabase = await createClient();
  const { error } = await supabase.from("stock_products").insert({
    clinic_id: clinicId,
    // code/code_number são atribuídos automaticamente pelo trigger 0058.
    name: d.name,
    active_ingredient: d.active_ingredient || null,
    presentation: d.presentation || null,
    barcode: d.barcode || null,
    anvisa_registration: d.anvisa_registration || null,
    category: d.category || null,
    therapeutic_class: d.therapeutic_class || null,
    unit: d.unit || "un",
    controlled_class: d.controlled_class || null,
    requires_prescription: d.requires_prescription === "true",
    quantity: d.quantity,
    min_quantity: d.min_quantity,
    max_quantity: d.max_quantity,
    location: d.location || null,
    cost: d.cost,
    price: d.price,
    manufacturer: d.manufacturer || null,
    supplier_id: d.supplier_id || null,
    active: d.active !== "false",
    notes: d.notes || null,
  });

  if (error) return { error: error.message };

  revalidateEstoque();
  return { ok: true };
}

// ── Dispensação / Separação (picking) ───────────────────────────────
const idSchema = z.string().min(1, "Registro inválido.");

/** Atualiza status/progresso de uma dispensação. */
async function updateDispensacao(
  id: string,
  patch: Record<string, unknown>,
): Promise<ActionState> {
  if (isDemoMode()) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("dispensations")
    .update(patch)
    .eq("id", id);

  if (error) return { error: error.message };
  revalidateEstoque();
  return { ok: true };
}

/** Inicia a separação (picking) de um pedido: pendente → separacao. */
export async function iniciarSeparacao(id: string): Promise<ActionState> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  return updateDispensacao(parsed.data, { status: "separacao" });
}

/**
 * Conclui a separação: separacao → concluido (progresso 100).
 * O guard `.eq("status","separacao")` garante a TRANSIÇÃO única — a baixa de
 * estoque (trigger trg_baixa_estoque_dispensacao, 0038) dispara na transição
 * para 'concluido' e é idempotente; concluir duas vezes não debita de novo.
 */
export async function concluirSeparacao(id: string): Promise<ActionState> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  if (isDemoMode()) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("dispensations")
    .update({ status: "concluido", progress: 100 })
    .eq("id", parsed.data)
    .eq("status", "separacao");

  if (error) return { error: error.message };
  revalidateEstoque();
  return { ok: true };
}

const recusaSchema = z.object({
  id: idSchema,
  motivo: z
    .string()
    .trim()
    .min(5, "Informe o motivo da recusa (mín. 5 caracteres)."),
});

/**
 * Recusa uma solicitação de retirada (dispensação): pendente|separacao →
 * cancelado, gravando o motivo em `cancel_reason` (0061). O guard
 * `.in("status", ["pendente","separacao"])` garante que só pedidos ainda NÃO
 * concluídos/recusados sejam recusados — evita "desfazer" uma retirada já
 * concluída (a baixa de estoque só ocorre ao concluir; a recusa não debita).
 * Se nada casar (já concluído/recusado por outro), devolve erro amigável.
 */
export async function recusarDispensacao(
  id: string,
  motivo: string,
): Promise<ActionState> {
  const parsed = recusaSchema.safeParse({ id, motivo });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  if (isDemoMode()) return { ok: true };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dispensations")
    .update({ status: "cancelado", cancel_reason: parsed.data.motivo })
    .eq("id", parsed.data.id)
    .in("status", ["pendente", "separacao"])
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Este pedido não pode mais ser recusado." };
  revalidateEstoque();
  return { ok: true };
}

const progressoSchema = z.object({
  id: idSchema,
  progresso: z.number().int().min(0).max(100),
});

/** Atualiza apenas o progresso da separação (marcação de itens). */
export async function atualizarProgressoSeparacao(
  id: string,
  progresso: number,
): Promise<ActionState> {
  const parsed = progressoSchema.safeParse({ id, progresso });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  return updateDispensacao(parsed.data.id, { progress: parsed.data.progresso });
}

/** Marca/desmarca uma dispensação como urgente. */
export async function marcarUrgente(
  id: string,
  urgente: boolean,
): Promise<ActionState> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  return updateDispensacao(parsed.data, { urgent: urgente });
}

// ── Nova Dispensação (criação de pedido) ────────────────────────────
const novaDispItemSchema = z.object({
  product_id: z.string().uuid("Produto inválido."),
  quantity_num: z.number().positive("A quantidade deve ser maior que zero."),
  // Item prescrito de origem (0043) — registra o vínculo p/ anti-duplicidade.
  prescription_item_id: z.string().uuid().nullable().optional(),
});

const criarDispensacaoSchema = z.object({
  kind: z.enum(["prescricao", "setor"]),
  patient_id: z.string().uuid().nullable().optional(),
  origin_name: z.string().trim().min(1, "Informe a origem do pedido."),
  origin_ref: z.string().trim().optional().or(z.literal("")),
  requested_by: z.string().trim().optional().or(z.literal("")),
  urgent: z.boolean().optional(),
  items: z.array(novaDispItemSchema).min(1, "Adicione ao menos um item."),
});

export type NovaDispensacaoInput = z.infer<typeof criarDispensacaoSchema>;

/**
 * Carrega os medicamentos prescritos a um paciente para pré-preencher a Nova
 * Dispensação por prescrição. Somente leitura — a RLS aplica o escopo de clínica
 * e o acesso clínico (LGPD); papéis sem acesso recebem lista vazia. Valida o
 * patientId na borda.
 */
export async function carregarItensPrescritos(
  patientId: string,
): Promise<{ itens: ItemPrescrito[]; error?: string }> {
  const parsed = z.string().min(1, "Paciente inválido.").safeParse(patientId);
  if (!parsed.success) return { itens: [], error: parsed.error.issues[0]?.message };
  const itens = await listItensPrescritosPaciente(parsed.data);
  return { itens };
}

/**
 * Cria um pedido de dispensação (por prescrição/paciente ou por setor) com seus
 * itens. Os campos desnormalizados de cada item (nome, unidade, localização,
 * lote, validade) são lidos do CATÁLOGO no servidor — não confiamos no client.
 * `quantity_num` alimenta a baixa de estoque na conclusão (trigger 0038);
 * `quantity` (texto) é só o rótulo de exibição. Pedido nasce 'pendente'.
 */
export async function criarDispensacao(
  input: NovaDispensacaoInput,
): Promise<ActionState> {
  const parsed = criarDispensacaoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (isDemoMode()) return { ok: true };

  const d = parsed.data;

  // (B4) Gate de papel server-side: dispensar POR PRESCRIÇÃO é ato clínico
  // (admin/médico), espelhando o gate de UI `podePrescricao`. "Por setor" segue
  // protegido pela RLS de staff em dispensations/dispensation_items.
  if (d.kind === "prescricao") {
    const guard = await requireClinico();
    if ("error" in guard) return { error: guard.error };
  }

  const clinicId = await requireClinic();
  const supabase = await createClient();

  // Por prescrição: o paciente DEVE existir e pertencer à clínica ativa (não
  // confiar só no client). A RLS já escopa, mas reforçamos explicitamente.
  if (d.kind === "prescricao") {
    if (!d.patient_id) return { error: "Selecione o paciente do pedido." };
    const { data: pac, error: pacErr } = await supabase
      .from("patients")
      .select("id")
      .eq("id", d.patient_id)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (pacErr) return { error: pacErr.message };
    if (!pac) return { error: "Paciente não encontrado nesta clínica." };

    // Itens vinculados a prescrição: revalidar no WRITE (a exclusão da listagem
    // é só prefiltro, sujeito a TOCTOU entre abrir o modal e submeter).
    const presIds = Array.from(
      new Set(
        d.items
          .map((i) => i.prescription_item_id)
          .filter((x): x is string => !!x),
      ),
    );
    if (presIds.length > 0) {
      // (B3) cada item prescrito DEVE pertencer a uma prescrição deste paciente
      // (o uuid vem do client; a FK só garante existência, não a posse).
      const { data: validos, error: vErr } = await supabase
        .from("prescription_items")
        .select("id, prescriptions!inner(patient_id)")
        .in("id", presIds)
        .eq("prescriptions.patient_id", d.patient_id);
      if (vErr) return { error: vErr.message };
      const validSet = new Set((validos ?? []).map((r) => r.id as string));
      if (presIds.some((id) => !validSet.has(id))) {
        return { error: "Item prescrito inválido para este paciente." };
      }

      // (B1) nenhum pode já estar vinculado a uma dispensação não-cancelada.
      const { data: jaDisp, error: jErr } = await supabase
        .from("dispensation_items")
        .select("prescription_item_id, dispensations!inner(status)")
        .in("prescription_item_id", presIds)
        .neq("dispensations.status", "cancelado");
      if (jErr) return { error: jErr.message };
      if ((jaDisp ?? []).length > 0) {
        return { error: "Um ou mais itens prescritos já foram dispensados." };
      }
    }
  }

  // Detalhes dos produtos selecionados (escopo de clínica via RLS). Inclui o
  // saldo atual (quantity) p/ a trava de quantidade ≤ saldo.
  const ids = Array.from(new Set(d.items.map((i) => i.product_id)));
  const { data: prods, error: prodErr } = await supabase
    .from("stock_products")
    .select("id, name, unit, location, lot, expiry, quantity")
    .in("id", ids);
  if (prodErr) return { error: prodErr.message };
  const byId = new Map((prods ?? []).map((p) => [p.id as string, p]));
  if (d.items.some((i) => !byId.has(i.product_id))) {
    return { error: "Um ou mais produtos não foram encontrados." };
  }

  // TRAVA DE RUPTURA (server-side): nenhuma linha pode exceder o saldo atual.
  // A baixa real é por trigger na conclusão (0038), mas barramos aqui para não
  // criar pedido impossível de atender e mascarar a falta. Espelhada no client.
  for (const i of d.items) {
    const p = byId.get(i.product_id)!;
    const saldo = Number(p.quantity ?? 0);
    if (i.quantity_num > saldo) {
      const nome = (p.name as string | null) ?? "produto";
      return {
        error: `Quantidade (${i.quantity_num}) acima do saldo de "${nome}" (disponível: ${saldo}).`,
      };
    }
  }

  const year = new Date().getFullYear();
  const seq = Date.now().toString().slice(-4);
  const code = d.kind === "prescricao" ? `PRESC-${year}-${seq}` : `REQ-${year}-${seq}`;

  const { data: disp, error } = await supabase
    .from("dispensations")
    .insert({
      clinic_id: clinicId,
      code,
      kind: d.kind,
      status: "pendente",
      urgent: d.urgent ?? false,
      patient_id: d.kind === "prescricao" ? d.patient_id || null : null,
      origin_label: d.kind === "prescricao" ? "Paciente" : "Setor",
      origin_name: d.origin_name,
      origin_ref: d.origin_ref || null,
      requested_by: d.requested_by || null,
      progress: 0,
    })
    .select("id")
    .single();

  if (error || !disp) {
    return { error: error?.message ?? "Falha ao criar a dispensação." };
  }

  const itens = d.items.map((i) => {
    const p = byId.get(i.product_id)!;
    const unit = (p.unit as string | null) ?? "un";
    return {
      clinic_id: clinicId,
      dispensation_id: disp.id,
      product_id: i.product_id,
      // Vínculo ao item prescrito só faz sentido no fluxo por prescrição (0043).
      prescription_item_id:
        d.kind === "prescricao" ? i.prescription_item_id ?? null : null,
      name: (p.name as string | null) ?? "—",
      quantity: `${i.quantity_num} ${unit}`.trim(), // rótulo de exibição
      quantity_num: i.quantity_num, // base da baixa (0038)
      location: (p.location as string | null) ?? null,
      lot: (p.lot as string | null) ?? null,
      expiry: (p.expiry as string | null) ?? null,
      picked: false,
    };
  });

  const { error: itErr } = await supabase
    .from("dispensation_items")
    .insert(itens);
  if (itErr) {
    // Rollback do pedido órfão (sem itens não tem sentido).
    await supabase.from("dispensations").delete().eq("id", disp.id);
    return { error: itErr.message };
  }

  revalidateEstoque();
  return { ok: true };
}

// ── Entrada de produtos (NF) ────────────────────────────────────────
// Multi-item por Nota Fiscal: cada item vira UM movimento 'entrada' (mesmo
// invoice_number/fornecedor), e o saldo do produto é incrementado pelo trigger
// trg_stock_entrada_saldo (0038). O total_value (financeiro) fica no PRIMEIRO
// movimento da NF; os demais ficam 0 — somar por NF reconstitui o total sem
// dupla contagem (ver agregação em listEntradas).
const entradaItemSchema = z.object({
  product_id: z.string().uuid("Produto inválido."),
  quantity: z.number().positive("A quantidade deve ser maior que zero."),
});

const entradaSchema = z.object({
  invoice_number: z.string().trim().min(1, "Informe o número da Nota Fiscal."),
  supplier_id: z.string().trim().optional().or(z.literal("")),
  total_value: numeroOpcional,
  items: z.array(entradaItemSchema).min(1, "Adicione ao menos um item."),
});

/** Registra uma entrada de produtos (1+ itens) vinculada a uma Nota Fiscal. */
export async function registrarEntrada(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // items chega como JSON (linhas dinâmicas do modal); os demais campos crus.
  let items: unknown = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Itens inválidos." };
  }

  const parsed = entradaSchema.safeParse({
    invoice_number: formData.get("invoice_number"),
    supplier_id: formData.get("supplier_id") ?? "",
    total_value: formData.get("total_value") ?? "",
    items,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (isDemoMode()) return { ok: true };

  const d = parsed.data;
  const clinicId = await requireClinic();
  const supabase = await createClient();

  const rows = d.items.map((it, idx) => ({
    clinic_id: clinicId,
    type: "entrada" as const,
    product_id: it.product_id,
    quantity: it.quantity,
    invoice_number: d.invoice_number,
    supplier_id: d.supplier_id || null,
    total_value: idx === 0 ? d.total_value : 0, // total só no 1º item da NF
    reason: "Entrada por Nota Fiscal",
  }));

  const { error } = await supabase.from("stock_movements").insert(rows);
  if (error) return { error: error.message };

  revalidateEstoque();
  return { ok: true };
}

// ── Compras (solicitação + decisão de cotação) ──────────────────────
const compraSchema = z.object({
  product_name: z.string().trim().min(2, "Informe o produto."),
  quantity: z.string().trim().min(1, "Informe a quantidade."),
  justification: z.string().trim().min(5, "Justifique a solicitação."),
});

/** Cria uma solicitação de compra com justificativa. */
export async function criarSolicitacaoCompra(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = compraSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (isDemoMode()) return { ok: true };

  const d = parsed.data;
  const clinicId = await requireClinic();
  const supabase = await createClient();
  const code = `SC-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
  const { error } = await supabase.from("purchase_requests").insert({
    clinic_id: clinicId,
    code,
    product_name: d.product_name,
    quantity: d.quantity,
    justification: d.justification,
    status: "solicitado",
  });

  if (error) return { error: error.message };
  revalidateEstoque();
  return { ok: true };
}

// ── Cotações (com anexo PDF no bucket privado 'cotacoes') ───────────
/** Limite de tamanho do anexo de cotação (5MB), espelhado no client. */
export const MAX_COTACAO_BYTES = 5 * 1024 * 1024;

const cotacaoSchema = z.object({
  purchase_request_id: idSchema,
  supplier_name: z.string().trim().min(2, "Informe o fornecedor."),
  amount: numeroOpcional,
  lead_time: z.string().trim().optional().or(z.literal("")),
});

/** Remove caracteres problemáticos do nome do arquivo (chave de Storage). */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

/**
 * Registra uma cotação de uma solicitação de compra, com upload opcional de um
 * PDF (≤5MB) ao bucket privado 'cotacoes'. O upload acontece NO SERVIDOR (a
 * Server Action recebe o File via FormData), no path
 * cotacoes/<clinic_id>/<request_id>/<arquivo> exigido pela RLS de Storage
 * (0031). Promove a solicitação para "Em Cotação". Em demo, simula sucesso.
 */
export async function criarCotacao(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = cotacaoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  // Anexo (opcional) — valida tipo PDF e tamanho ANTES de qualquer escrita.
  const file = formData.get("attachment");
  const temAnexo = file instanceof File && file.size > 0;
  if (temAnexo) {
    const isPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) return { error: "O anexo deve ser um arquivo PDF." };
    if (file.size > MAX_COTACAO_BYTES) {
      return { error: "O anexo excede o limite de 5MB." };
    }
  }

  if (isDemoMode()) return { ok: true };

  const clinicId = await requireClinic();
  const supabase = await createClient();

  // Upload do PDF (se houver) — falha de upload aborta o registro.
  let attachmentPath: string | null = null;
  let attachmentName: string | null = null;
  let attachmentSize: number | null = null;
  if (temAnexo) {
    const f = file as File;
    const path = `${clinicId}/${d.purchase_request_id}/${Date.now()}-${sanitizeFilename(f.name)}`;
    const { error: upErr } = await supabase.storage
      .from("cotacoes")
      .upload(path, f, { contentType: "application/pdf", upsert: false });
    if (upErr) return { error: `Falha no upload do anexo: ${upErr.message}` };
    attachmentPath = path;
    attachmentName = f.name;
    attachmentSize = f.size;
  }

  const { error } = await supabase.from("quotations").insert({
    clinic_id: clinicId,
    purchase_request_id: d.purchase_request_id,
    supplier_name: d.supplier_name,
    amount: d.amount,
    lead_time: d.lead_time || null,
    attachment_url: attachmentName, // nome p/ exibição
    attachment_path: attachmentPath, // caminho no bucket
    attachment_size: attachmentSize,
  });
  if (error) {
    // Rollback do binário órfão se o insert falhar.
    if (attachmentPath) {
      await supabase.storage.from("cotacoes").remove([attachmentPath]);
    }
    return { error: error.message };
  }

  // Promove a solicitação a "Em Cotação" (só a partir de 'solicitado').
  await supabase
    .from("purchase_requests")
    .update({ status: "cotacao" })
    .eq("id", d.purchase_request_id)
    .eq("status", "solicitado");

  revalidateEstoque();
  return { ok: true };
}

/**
 * Gera uma URL assinada (10 min) para baixar o PDF de uma cotação do bucket
 * privado 'cotacoes'. A RLS de Storage garante que só staff da clínica dona do
 * arquivo consegue assinar. Em demo, não há arquivo real → null.
 */
export async function getCotacaoUrl(
  path: string,
): Promise<{ url?: string; error?: string }> {
  const parsed = z.string().min(1).safeParse(path);
  if (!parsed.success) return { error: "Anexo inválido." };

  if (isDemoMode()) return { error: "Anexo indisponível no modo demonstração." };

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("cotacoes")
    .createSignedUrl(parsed.data, 600);
  if (error || !data) return { error: error?.message ?? "Falha ao abrir anexo." };
  return { url: data.signedUrl };
}

/** Aprova ou reprova uma solicitação de compra. */
export async function decidirCompra(
  id: string,
  aprovar: boolean,
): Promise<ActionState> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  if (isDemoMode()) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_requests")
    .update({ status: aprovar ? "aprovado" : "reprovado" })
    .eq("id", parsed.data);

  if (error) return { error: error.message };
  revalidateEstoque();
  return { ok: true };
}

// ── Inventário ──────────────────────────────────────────────────────
const inventarioSchema = z.object({
  kind: z.enum(["geral", "parcial"]),
  category: z.string().trim().optional().or(z.literal("")),
});

/** Abre um inventário (geral ou parcial por categoria). */
export async function abrirInventario(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = inventarioSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const d = parsed.data;
  const categoria = d.kind === "parcial" ? d.category || null : null;
  if (d.kind === "parcial" && !categoria) {
    return { error: "Selecione a categoria do inventário parcial." };
  }

  if (isDemoMode()) return { ok: true };

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const code = `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
  const { data: inv, error } = await supabase
    .from("inventories")
    .insert({
      clinic_id: clinicId,
      code,
      kind: d.kind,
      category: categoria,
      status: "aberto",
    })
    .select("id")
    .single();

  if (error || !inv) {
    return { error: error?.message ?? "Falha ao abrir inventário." };
  }

  // SNAPSHOT: congela o saldo atual de cada produto do escopo como base de
  // conferência (system_qty). As contagens são preenchidas depois.
  let q = supabase
    .from("stock_products")
    .select("id, name, category, quantity")
    .eq("active", true);
  if (categoria) q = q.eq("category", categoria);
  const { data: produtos } = await q;

  if (produtos && produtos.length > 0) {
    const { error: snapErr } = await supabase.from("inventory_counts").insert(
      produtos.map((p) => ({
        clinic_id: clinicId,
        inventory_id: inv.id,
        product_id: p.id,
        product_name: (p.name as string | null) ?? "—",
        system_qty: Number(p.quantity ?? 0),
      })),
    );
    if (snapErr) return { error: snapErr.message };
  }

  revalidateEstoque();
  return { ok: true };
}

// ── Inventário: contagens + fechamento ──────────────────────────────
const contagemSchema = z.object({
  id: idSchema, // inventory_counts.id
  count_1: z.number().min(0).nullable(),
  count_2: z.number().min(0).nullable(),
  count_3: z.number().min(0).nullable(),
});

/** Converte "" / "12,5" em number|null (campo de contagem opcional). */
function parseContagem(v: unknown): number | null {
  const s = String(v ?? "").trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Salva as 3 contagens de uma linha de inventário (inventory_counts). Recebe os
 * valores crus do front (string|null) e normaliza. RLS garante que só staff da
 * clínica dona da linha atualiza. Em demo, simula sucesso.
 */
export async function salvarContagem(input: {
  id: string;
  count_1: unknown;
  count_2: unknown;
  count_3: unknown;
}): Promise<ActionState> {
  const parsed = contagemSchema.safeParse({
    id: input.id,
    count_1: parseContagem(input.count_1),
    count_2: parseContagem(input.count_2),
    count_3: parseContagem(input.count_3),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Contagem inválida." };
  }

  if (isDemoMode()) return { ok: true };

  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_counts")
    .update({ count_1: d.count_1, count_2: d.count_2, count_3: d.count_3 })
    .eq("id", d.id);

  if (error) return { error: error.message };
  revalidateEstoque();
  return { ok: true };
}

/**
 * Fecha um inventário (aberto → fechado), registrando o horário. O guard
 * `.eq("status","aberto")` garante a TRANSIÇÃO única: na passagem para 'fechado'
 * o trigger trg_reconcilia_inventario (0038) reconcilia o saldo de cada produto
 * para a contagem final e grava o movimento de ajuste da divergência. Salve as
 * contagens (salvarContagem) ANTES de fechar — só elas alimentam a reconciliação.
 */
export async function fecharInventario(id: string): Promise<ActionState> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  if (isDemoMode()) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventories")
    .update({ status: "fechado", closed_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("status", "aberto");

  if (error) return { error: error.message };
  revalidateEstoque();
  return { ok: true };
}
