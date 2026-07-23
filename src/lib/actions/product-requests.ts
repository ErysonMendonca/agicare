"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireClinic } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/auth";
import { canView } from "@/lib/permissions";
import { SETORES } from "@/lib/data/product-requests.shared";

export type ActionState = { error?: string; ok?: boolean } | undefined;

/** Gate de módulo server-side (espelha requireView da página). RLS de staff não
 * checa a matriz de permissões — reforçamos aqui p/ toda Server Action. */
async function guardModulo(): Promise<{ error: string } | null> {
  if (!(await canView("solicitacoes"))) {
    return { error: "Acesso negado ao módulo de Solicitações." };
  }
  return null;
}

function revalidar() {
  revalidatePath("/solicitacoes");
  revalidatePath("/estoque");
}

const criarSchema = z.object({
  setor: z.enum(SETORES),
  supplierSector: z.string().trim().min(1, "Selecione o setor fornecedor.").max(120),
  urgent: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid("Produto inválido."),
        quantity_num: z.number().positive("Quantidade deve ser maior que zero."),
      }),
    )
    .min(1, "Adicione ao menos um item."),
});

export type NovaSolicitacaoInput = z.input<typeof criarSchema>;

/**
 * Cria uma solicitação de produtos por setor (pendente). NÃO checa saldo nem dá
 * baixa — é um pedido; a baixa segue pela Dispensação do Estoque ao atender.
 * Desnormaliza nome/unidade do produto p/ histórico estável.
 */
export async function criarSolicitacao(
  input: NovaSolicitacaoInput,
): Promise<ActionState> {
  const parsed = criarSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }


  const negado = await guardModulo();
  if (negado) return negado;

  const d = parsed.data;
  const clinicId = await requireClinic();
  const supabase = await createClient();
  const me = await getCurrentUser();

  // Produtos: nome/unidade para desnormalizar (RLS escopa por clínica).
  const ids = Array.from(new Set(d.items.map((i) => i.product_id)));
  const { data: prods, error: prodErr } = await supabase
    .from("stock_products")
    .select("id, name, unit")
    .in("id", ids);
  if (prodErr) return { error: prodErr.message };
  const byId = new Map((prods ?? []).map((p) => [p.id as string, p]));
  if (d.items.some((i) => !byId.has(i.product_id))) {
    return { error: "Um ou mais produtos não foram encontrados." };
  }

  // Rótulo do pedido. Não é sequencial garantido; usa mais dígitos do timestamp
  // para reduzir colisão (não há UNIQUE — é só exibição).
  const year = new Date().getFullYear();
  const seq = Date.now().toString().slice(-6);
  const code = `SOL-${year}-${seq}`;

  const { data: req, error } = await supabase
    .from("product_requests")
    .insert({
      clinic_id: clinicId,
      code,
      setor: d.setor,
      supplier_sector: d.supplierSector,
      status: "pendente",
      urgent: d.urgent ?? false,
      notes: d.notes || null,
      requested_by: me?.userId ?? null,
    })
    .select("id")
    .single();

  if (error || !req) {
    return { error: error?.message ?? "Falha ao criar a solicitação." };
  }

  const itens = d.items.map((i) => {
    const p = byId.get(i.product_id)!;
    return {
      clinic_id: clinicId,
      request_id: req.id,
      product_id: i.product_id,
      product_name: (p.name as string | null) ?? "—",
      unit: (p.unit as string | null) ?? null,
      quantity_num: i.quantity_num,
    };
  });

  const { error: itErr } = await supabase
    .from("product_request_items")
    .insert(itens);
  if (itErr) {
    // Sem transação no PostgREST: se os itens falham, remove o cabeçalho órfão
    // para não deixar solicitação sem itens (escopado por clínica/RLS).
    await supabase
      .from("product_requests")
      .delete()
      .eq("id", req.id)
      .eq("clinic_id", clinicId);
    return { error: itErr.message };
  }

  revalidar();
  return { ok: true };
}

const idSchema = z.string().uuid("Solicitação inválida.");

const registrarSchema = z.object({
  requestId: idSchema,
  urgent: z.boolean().optional(),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid("Item inválido."),
        product_id: z.string().uuid("Produto inválido."),
        quantity_num: z.number().min(0),
      }),
    )
    .min(1, "Nenhum item para processar."),
});

export type RegistrarAtendimentoInput = z.input<typeof registrarSchema>;

/**
 * Registra uma PASSAGEM de atendimento de uma solicitação — parcial ou total.
 * Suporta múltiplas chamadas na mesma solicitação (bipagem/edição incremental):
 * cada chamada dá baixa SÓ da quantidade informada agora por linha (itemId),
 * soma em product_request_items.quantity_atendida (0119) e recalcula o status
 * (atendida = todo item completo; atendida_parcial = algo atendido mas falta
 * item/quantidade; nunca perde o pedido — a diferença fica pendente na fila).
 *
 * SEGURANÇA / CONSISTÊNCIA (sem transação no PostgREST) — a baixa de estoque é
 * o ÚLTIMO passo (mais difícil de desfazer), assim:
 *   1) valida request + itens + saldo (somente leitura);
 *   2) cria a dispensação 'pendente' + itens desta passagem (stock intocado);
 *   3) soma quantity_atendida nos itens da solicitação (stock intocado; se
 *      falhar aqui, apaga a dispensação recém-criada e sai sem ter mexido em nada);
 *   4) atualiza o status da solicitação com guard otimista (`eq status` do valor
 *      lido em (1) — corrida com outro atendimento simultâneo é detectada e
 *      revertida);
 *   5) só então CONCLUI a dispensação (dispara a baixa real via trigger 0038 +
 *      anti-oversell 0045). Se o saldo não bastar, o trigger rejeita e revertemos
 *      TUDO (dispensação, quantity_atendida e status voltam ao estado anterior).
 */
export async function registrarAtendimento(
  input: RegistrarAtendimentoInput,
): Promise<ActionState> {
  const parsed = registrarSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const negado = await guardModulo();
  if (negado) return negado;

  const d = parsed.data;
  const clinicId = await requireClinic();
  const supabase = await createClient();
  const me = await getCurrentUser();

  // Solicitação DEVE existir, pertencer à clínica e ainda estar em aberto
  // (pendente ou já parcialmente atendida — nunca reabrimos 'atendida'/'cancelada').
  const { data: req, error: reqErr } = await supabase
    .from("product_requests")
    .select("id, code, setor, supplier_sector, status, attended_by, attended_at")
    .eq("id", d.requestId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (reqErr) return { error: reqErr.message };
  if (!req) return { error: "Solicitação não encontrada." };
  const status0 = req.status as string;
  if (status0 !== "pendente" && status0 !== "atendida_parcial") {
    return { error: "Solicitação já foi concluída ou cancelada." };
  }

  // Itens da solicitação (fonte de verdade do requisitado/já atendido — nunca
  // confia só no que o client mandou).
  const { data: itensReq, error: itensReqErr } = await supabase
    .from("product_request_items")
    .select("id, product_id, quantity_num, quantity_atendida")
    .eq("request_id", d.requestId);
  if (itensReqErr) return { error: itensReqErr.message };
  const itensById = new Map((itensReq ?? []).map((it) => [it.id as string, it]));

  // Só processa linhas com quantidade > 0 nesta passagem.
  const aAtender = d.items.filter((i) => i.quantity_num > 0);
  if (aAtender.length === 0) {
    return { error: "Informe ao menos uma quantidade para atender." };
  }
  for (const i of aAtender) {
    const item = itensById.get(i.itemId);
    if (!item) return { error: "Item não pertence a esta solicitação." };
    if (item.product_id && item.product_id !== i.product_id) {
      return { error: "Produto não corresponde ao item da solicitação." };
    }
    const pendenteItem =
      Number(item.quantity_num ?? 0) - Number(item.quantity_atendida ?? 0);
    if (i.quantity_num > pendenteItem + 0.001) {
      return {
        error: `Quantidade (${i.quantity_num}) acima do pendente do item (${pendenteItem}).`,
      };
    }
  }

  // Produtos + saldo atual (RLS escopa por clínica). Espelha a trava de ruptura
  // do client; a baixa autoritativa é no trigger 0045 (rejeita oversell).
  const ids = Array.from(new Set(aAtender.map((i) => i.product_id)));
  const { data: prods, error: prodErr } = await supabase
    .from("stock_products")
    .select("id, name, unit, location, lot, expiry, quantity")
    .in("id", ids);
  if (prodErr) return { error: prodErr.message };
  const prodsById = new Map((prods ?? []).map((p) => [p.id as string, p]));
  if (aAtender.some((i) => !prodsById.has(i.product_id))) {
    return { error: "Um ou mais produtos não foram encontrados." };
  }
  for (const i of aAtender) {
    const p = prodsById.get(i.product_id)!;
    const saldo = Number(p.quantity ?? 0);
    if (i.quantity_num > saldo) {
      const nome = (p.name as string | null) ?? "produto";
      return {
        error: `Quantidade (${i.quantity_num}) acima do saldo de "${nome}" (disponível: ${saldo}).`,
      };
    }
  }

  // (2) Cria a dispensação desta PASSAGEM, vinculada à solicitação (0118).
  const year = new Date().getFullYear();
  const seq = Date.now().toString().slice(-4);
  const code = `REQ-${year}-${seq}`;

  const { data: disp, error: dispErr } = await supabase
    .from("dispensations")
    .insert({
      clinic_id: clinicId,
      code,
      kind: "setor",
      status: "pendente",
      urgent: d.urgent ?? false,
      patient_id: null,
      origin_label: "Setor",
      origin_name: (req.setor as string | null) ?? "Setor",
      origin_ref: (req.code as string | null) ?? null,
      product_request_id: d.requestId,
      progress: 0,
    })
    .select("id")
    .single();
  if (dispErr || !disp) {
    return { error: dispErr?.message ?? "Falha ao criar a dispensação." };
  }

  const apagarDispensacaoOrfa = async () => {
    await supabase.from("dispensations").delete().eq("id", disp.id);
  };

  const itensDisp = aAtender.map((i) => {
    const p = prodsById.get(i.product_id)!;
    const unit = (p.unit as string | null) ?? "un";
    return {
      clinic_id: clinicId,
      dispensation_id: disp.id,
      product_id: i.product_id,
      prescription_item_id: null,
      name: (p.name as string | null) ?? "—",
      quantity: `${i.quantity_num} ${unit}`.trim(),
      quantity_num: i.quantity_num,
      location: (p.location as string | null) ?? null,
      lot: (p.lot as string | null) ?? null,
      expiry: (p.expiry as string | null) ?? null,
      picked: true,
    };
  });
  const { error: itErr } = await supabase
    .from("dispensation_items")
    .insert(itensDisp);
  if (itErr) {
    await apagarDispensacaoOrfa();
    return { error: itErr.message };
  }

  // (3) Soma quantity_atendida por item (stock ainda intocado). Guarda os
  // valores anteriores para reverter se algo falhar adiante.
  const anteriores = new Map(
    aAtender.map((i) => [i.itemId, itensById.get(i.itemId)!.quantity_atendida ?? 0]),
  );
  for (const i of aAtender) {
    const atual = Number(anteriores.get(i.itemId) ?? 0);
    const { error: updItemErr } = await supabase
      .from("product_request_items")
      .update({ quantity_atendida: atual + i.quantity_num })
      .eq("id", i.itemId)
      .eq("request_id", d.requestId);
    if (updItemErr) {
      // Reverte as somas já aplicadas nesta passagem + apaga a dispensação órfã.
      for (const j of aAtender) {
        const prev = anteriores.get(j.itemId);
        if (prev != null) {
          await supabase
            .from("product_request_items")
            .update({ quantity_atendida: prev })
            .eq("id", j.itemId)
            .eq("request_id", d.requestId);
        }
      }
      await apagarDispensacaoOrfa();
      return { error: updItemErr.message };
    }
  }

  // Status final: completo se TODO item (após esta passagem) está com
  // quantity_atendida >= quantity_num; senão parcial.
  const completo = (itensReq ?? []).every((it) => {
    const somadoAgora = aAtender.find((a) => a.itemId === it.id)?.quantity_num ?? 0;
    const total = Number(it.quantity_atendida ?? 0) + somadoAgora;
    return total >= Number(it.quantity_num ?? 0) - 0.001;
  });
  const novoStatus = completo ? "atendida" : "atendida_parcial";
  const agora = new Date().toISOString();

  // (4) Atualiza o status com guard otimista — se outra passagem simultânea já
  // mudou o status (corrida), reverte tudo o que fizemos até aqui.
  const { data: statusAtualizado, error: statusErr } = await supabase
    .from("product_requests")
    .update({ status: novoStatus, attended_by: me?.userId ?? null, attended_at: agora })
    .eq("id", d.requestId)
    .eq("clinic_id", clinicId)
    .eq("status", status0)
    .select("id");
  if (statusErr || !statusAtualizado || statusAtualizado.length === 0) {
    for (const j of aAtender) {
      const prev = anteriores.get(j.itemId);
      if (prev != null) {
        await supabase
          .from("product_request_items")
          .update({ quantity_atendida: prev })
          .eq("id", j.itemId)
          .eq("request_id", d.requestId);
      }
    }
    await apagarDispensacaoOrfa();
    return {
      error:
        statusErr?.message ??
        "Esta solicitação foi alterada por outro atendimento simultâneo. Recarregue e tente novamente.",
    };
  }

  // (5) CONCLUI a dispensação → dispara a baixa (0038) com anti-oversell (0045).
  // Se o saldo não bastar, o trigger REJEITA e este update falha: revertemos
  // TUDO (status, quantity_atendida e apaga a dispensação).
  const { error: concErr } = await supabase
    .from("dispensations")
    .update({ status: "concluido", progress: 100 })
    .eq("id", disp.id)
    .eq("status", "pendente");
  if (concErr) {
    await supabase
      .from("product_requests")
      .update({
        status: status0,
        attended_by: (req.attended_by as string | null) ?? null,
        attended_at: (req.attended_at as string | null) ?? null,
      })
      .eq("id", d.requestId)
      .eq("clinic_id", clinicId);
    for (const j of aAtender) {
      const prev = anteriores.get(j.itemId);
      if (prev != null) {
        await supabase
          .from("product_request_items")
          .update({ quantity_atendida: prev })
          .eq("id", j.itemId)
          .eq("request_id", d.requestId);
      }
    }
    await apagarDispensacaoOrfa();
    return { error: concErr.message };
  }

  revalidar();
  revalidatePath(`/estoque/solicitacoes/${d.requestId}/atender`);
  return { ok: true };
}

/**
 * Cria uma NOVA solicitação (pendente) clonando setor/fornecedor/itens da
 * solicitação original — quantidades REQUISITADAS (não as já atendidas).
 * Útil para reabrir um pedido recorrente sem redigitar tudo.
 */
export async function replicarSolicitacao(id: string): Promise<ActionState> {
  if (!idSchema.safeParse(id).success) return { error: "Solicitação inválida." };

  const negado = await guardModulo();
  if (negado) return negado;

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const me = await getCurrentUser();

  const { data: original, error: origErr } = await supabase
    .from("product_requests")
    .select("setor, supplier_sector, urgent, notes")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (origErr) return { error: origErr.message };
  if (!original) return { error: "Solicitação original não encontrada." };

  const { data: itensOriginais, error: itensErr } = await supabase
    .from("product_request_items")
    .select("product_id, product_name, unit, quantity_num")
    .eq("request_id", id);
  if (itensErr) return { error: itensErr.message };
  if (!itensOriginais || itensOriginais.length === 0) {
    return { error: "Solicitação original não tem itens." };
  }

  const year = new Date().getFullYear();
  const seq = Date.now().toString().slice(-6);
  const code = `SOL-${year}-${seq}`;

  const { data: nova, error: novaErr } = await supabase
    .from("product_requests")
    .insert({
      clinic_id: clinicId,
      code,
      setor: original.setor,
      supplier_sector: original.supplier_sector,
      status: "pendente",
      urgent: original.urgent ?? false,
      notes: original.notes ?? null,
      requested_by: me?.userId ?? null,
    })
    .select("id")
    .single();
  if (novaErr || !nova) {
    return { error: novaErr?.message ?? "Falha ao replicar a solicitação." };
  }

  const itens = itensOriginais.map((it) => ({
    clinic_id: clinicId,
    request_id: nova.id,
    product_id: it.product_id,
    product_name: it.product_name,
    unit: it.unit,
    quantity_num: it.quantity_num,
  }));
  const { error: itErr } = await supabase.from("product_request_items").insert(itens);
  if (itErr) {
    await supabase.from("product_requests").delete().eq("id", nova.id);
    return { error: itErr.message };
  }

  revalidar();
  return { ok: true };
}

/** Cancela a solicitação (só se estiver pendente). */
export async function cancelarSolicitacao(id: string): Promise<ActionState> {
  if (!idSchema.safeParse(id).success) return { error: "Solicitação inválida." };

  const negado = await guardModulo();
  if (negado) return negado;

  const clinicId = await requireClinic();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("product_requests")
    .update({ status: "cancelada" })
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .eq("status", "pendente")
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Solicitação não está mais pendente." };
  }

  revalidar();
  return { ok: true };
}
