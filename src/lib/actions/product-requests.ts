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

/** Marca a solicitação como ATENDIDA (só se estiver pendente). Estoque/staff. */
export async function atenderSolicitacao(id: string): Promise<ActionState> {
  if (!idSchema.safeParse(id).success) return { error: "Solicitação inválida." };

  const negado = await guardModulo();
  if (negado) return negado;

  const clinicId = await requireClinic();
  const supabase = await createClient();
  const me = await getCurrentUser();

  const { data, error } = await supabase
    .from("product_requests")
    .update({
      status: "atendida",
      attended_by: me?.userId ?? null,
      attended_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .eq("status", "pendente")
    .select("id");
  if (error) return { error: error.message };
  // 0 linhas = já foi atendida/cancelada por outro (evita toast enganoso).
  if (!data || data.length === 0) {
    return { error: "Solicitação não está mais pendente." };
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
