"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isGestor } from "@/lib/auth";
import { requireAction, can } from "@/lib/permissions";
import { gerarLoteTissXML, type GuiaXML } from "@/lib/faturamento-tiss";
import {
  getCheckoutData,
  getCheckoutSalvo,
  avaliarGuiaTiss,
  type ItemCheckout,
  type CheckoutSalvo,
  type TissGuideStatus,
} from "@/lib/data/billing";

export type ActionState = { error?: string; ok?: boolean } | undefined;

/** Resultado da validação de uma guia: além de ok/error, devolve o veredito. */
export type ValidarGuiaState =
  | { error?: string; ok?: boolean; validacao?: TissGuideStatus }
  | undefined;

/** ActionState do gerador de XML: além de ok/error, devolve o conteúdo p/ download. */
export type GerarLoteState =
  | { error?: string; ok?: boolean; xml?: string; nomeArquivo?: string }
  | undefined;

const idSchema = z.string().min(1, "Registro inválido.");

/** Item conferido enviado pelo client (origem real do atendimento). */
const itemSchema = z.object({
  source: z.enum(["procedimento", "exame", "material", "ajuste"]),
  tipo: z.enum(["TUSS", "Material"]),
  codigo: z.string().max(64),
  descricao: z.string().min(1).max(240),
  qtd: z.number().finite().nonnegative().default(1),
  valor: z.number().finite().default(0),
});

/** Aceita "" (campo vazio) e normaliza para undefined. */
const dataOpcional = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .optional()
  .or(z.literal("").transform(() => undefined));

/** Dados da NF + prazos quando o pagador é uma empresa conveniada. */
const empresaSchema = z.object({
  nfNumero: z.string().trim().max(40).optional(),
  nfEmissao: dataOpcional,
  nfVencimento: dataOpcional,
  nfPrazos: z.string().trim().max(120).optional(),
});

const checkoutSchema = z.object({
  eventCode: idSchema,
  forma: z.enum(["particular", "convenio", "empresa"]),
  pagamento: z.enum(["pix", "cartao", "boleto"]).optional(),
  desconto: z.number().finite().nonnegative().default(0),
  acrescimo: z.number().finite().nonnegative().default(0),
  itens: z.array(itemSchema).max(50).default([]),
  empresa: empresaSchema.optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/**
 * Carrega os itens REAIS conferidos de um evento (procedimento TUSS + exames
 * + materiais), para o modal de check-out. Não escreve nada.
 */
export async function carregarItensCheckout(
  eventCode: string,
  fallbackServico: string,
  fallbackValor: number,
): Promise<{ itens: ItemCheckout[] }> {
  // Leitura de dado financeiro: exige ver o módulo (a RLS é a 2ª camada).
  if (await requireAction("faturamento", "view")) return { itens: [] };
  const parsed = idSchema.safeParse(eventCode);
  if (!parsed.success) return { itens: [] };
  const data = await getCheckoutData(parsed.data, fallbackServico, fallbackValor);
  return { itens: data.itens };
}

/**
 * Carrega o check-out REAL já gravado de um evento faturado (itens + forma +
 * desconto/acréscimo/total/data) para VISUALIZAR/IMPRIMIR o recibo e para
 * EDITAR (reabrir a conferência pré-preenchida). Não escreve nada.
 */
export async function carregarCheckoutSalvo(
  eventCode: string,
): Promise<{ recibo: CheckoutSalvo | null }> {
  // Leitura de dado financeiro: exige ver o módulo (a RLS é a 2ª camada).
  if (await requireAction("faturamento", "view")) return { recibo: null };
  const parsed = idSchema.safeParse(eventCode);
  if (!parsed.success) return { recibo: null };
  const recibo = await getCheckoutSalvo(parsed.data);
  return { recibo };
}

/** Revalida as rotas afetadas por mudanças no faturamento. */
function revalidateFaturamento() {
  revalidatePath("/faturamento");
  revalidatePath("/dashboard");
}

/**
 * Registra a conferência de check-out de um evento faturável.
 * Grava os ITENS reais em billing_items (procedimentos TUSS + exames +
 * materiais), persiste desconto/acréscimo e total líquido em billable_events,
 * define a forma (particular/convenio/empresa) e muda o status p/ faturado.
 * Os ajustes afetam apenas a cobrança — não tocam o prontuário.
 * Ajustar valores (desconto/acréscimo/item/valor) exige a permissão
 * `faturamento_ajustes` (validada também no servidor).
 */
export async function registrarCheckout(
  input: CheckoutInput,
): Promise<ActionState> {
  // Gate de módulo (matriz de permissões): fechar check-out é uma edição.
  const denied = await requireAction("faturamento", "edit");
  if (denied) return { error: denied };

  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { eventCode, forma, pagamento, desconto, acrescimo, empresa } =
    parsed.data;

  // Gate financeiro server-side (permissão editável `faturamento_ajustes`): cobre
  // desconto, acréscimo, item manual e edição de valor. Admin sempre pode.
  const podeAjustar = await can("faturamento_ajustes", "view");
  if (!podeAjustar && (desconto > 0 || acrescimo > 0)) {
    return {
      error: "Você não tem permissão para aplicar descontos ou acréscimos.",
    };
  }

  // Reabertura de conta faturada permanece restrita ao gestor (ver abaixo).
  const gestor = await isGestor();


  const supabase = await createClient();

  // Localiza o evento pelo código de negócio (traz status + ajustes gravados).
  const { data: evt, error: evtErr } = await supabase
    .from("billable_events")
    .select("id, amount, status, discount, surcharge")
    .eq("code", eventCode)
    .maybeSingle();

  if (evtErr) return { error: evtErr.message };
  if (!evt) return { error: "Evento faturável não encontrado." };

  // REABERTURA de conta já faturada (modo "editar" do recibo) é admin-only:
  // regravar itens/valores de um check-out fechado altera o que já foi cobrado
  // e o histórico contábil. Fechar a conta pela 1ª vez segue liberado a quem
  // tem `faturamento × edit` (ex.: recepção).
  if (evt.status === "faturado" && !gestor) {
    return {
      error: "Apenas o gestor pode reabrir um check-out já faturado.",
    };
  }

  // Sem permissão de ajuste: PRESERVA o desconto/acréscimo já gravado
  // (ex.: editando um evento que já teve abatimento) em vez de zerar.
  const descontoFinal = podeAjustar ? desconto : Number(evt.discount ?? 0);
  const acrescimoFinal = podeAjustar ? acrescimo : Number(evt.surcharge ?? 0);

  // ENFORCEMENT dos itens: quem PODE ajustar conferiu/editou os itens no modal
  // (inclui item manual e valor editado) → confia no payload. Quem NÃO pode não
  // pode injetar item manual nem alterar valor: recarrega os itens REAIS do
  // atendimento no servidor e ignora o que veio do client.
  let itensReais = parsed.data.itens;
  if (!podeAjustar) {
    const reais = await getCheckoutData(eventCode, "", Number(evt.amount ?? 0));
    itensReais = reais.itens;
  }

  const subtotal = itensReais.reduce((acc, i) => acc + i.valor * i.qtd, 0);
  const netAmount = Math.max(0, subtotal - descontoFinal + acrescimoFinal);

  // Regrava os itens conferidos (limpa anteriores → idempotente por evento).
  await supabase.from("billing_items").delete().eq("event_id", evt.id);

  const linhas = itensReais.map((i) => ({
    event_id: evt.id,
    kind: (i.tipo === "Material" ? "material" : "tuss") as "material" | "tuss",
    source: i.source,
    code: i.codigo,
    description: i.descricao,
    quantity: i.qtd,
    unit_price: i.valor,
    amount: Math.round(i.valor * i.qtd * 100) / 100,
  }));

  // Desconto/acréscimo viram itens de ajuste (auditável) + colunas no evento.
  if (descontoFinal > 0) {
    linhas.push({
      event_id: evt.id,
      kind: "tuss",
      source: "ajuste",
      code: "DESC",
      description: "Desconto aplicado no check-out",
      quantity: 1,
      unit_price: -descontoFinal,
      amount: -descontoFinal,
    });
  }
  if (acrescimoFinal > 0) {
    linhas.push({
      event_id: evt.id,
      kind: "tuss",
      source: "ajuste",
      code: "ACRE",
      description: "Acréscimo aplicado no check-out",
      quantity: 1,
      unit_price: acrescimoFinal,
      amount: acrescimoFinal,
    });
  }

  if (linhas.length > 0) {
    const { error: itensErr } = await supabase
      .from("billing_items")
      .insert(linhas);
    if (itensErr) return { error: itensErr.message };
  }

  // Pagador empresa: persiste os dados da NF + prazos; demais formas zeram.
  const dadosEmpresa =
    forma === "empresa"
      ? {
          nf_number: empresa?.nfNumero || null,
          nf_issue_date: empresa?.nfEmissao ?? null,
          nf_due_date: empresa?.nfVencimento ?? null,
          nf_terms: empresa?.nfPrazos || null,
        }
      : {
          nf_number: null,
          nf_issue_date: null,
          nf_due_date: null,
          nf_terms: null,
        };

  const { error } = await supabase
    .from("billable_events")
    .update({
      kind: forma,
      status: "faturado",
      discount: descontoFinal,
      surcharge: acrescimoFinal,
      net_amount: netAmount,
      payment_method: forma === "particular" ? (pagamento ?? "pix") : null,
      checked_out_at: new Date().toISOString(),
      ...dadosEmpresa,
    })
    .eq("id", evt.id);

  if (error) return { error: error.message };

  revalidateFaturamento();
  return { ok: true };
}

/**
 * Snapshot da guia enviado pelo client — usado APENAS no modo demo (sem banco)
 * para o veredito ser interativo. Em modo real é ignorado: a validação lê os
 * dados autoritativos do banco (não confia no client).
 */
const guiaSnapshotSchema = z
  .object({
    temPaciente: z.boolean().default(true),
    insurance: z.string().nullable().default(null),
    procedure_code: z.string().nullable().default(null),
    amount: z.number().finite().nonnegative().default(0),
    validation_note: z.string().nullable().default(null),
  })
  .optional();

/**
 * Valida uma guia TISS aplicando regras determinísticas (avaliarGuiaTiss):
 * grava o veredito (validada | alerta | erro) + a nota e devolve o resultado
 * para a UI sinalizar ao usuário. RLS de staff protege a escrita.
 */
export async function validarGuia(
  id: string,
  snapshot?: z.input<typeof guiaSnapshotSchema>,
): Promise<ValidarGuiaState> {
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) return { error: idParsed.error.issues[0]?.message };

  // Gate financeiro/TISS server-side (defesa em profundidade sobre a RLS de
  // staff): validar guia é operação do gestor de faturamento.
  if (!(await isGestor())) {
    return { error: "Apenas o gestor pode validar guias TISS." };
  }


  const supabase = await createClient();

  // Lê os dados autoritativos da guia (ignora o snapshot do client).
  const { data: guia, error: readErr } = await supabase
    .from("tiss_guides")
    .select("id, patient_id, insurance, procedure_code, amount, validation_note")
    .eq("id", idParsed.data)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!guia) return { error: "Guia não encontrada." };

  const { validacao, nota } = avaliarGuiaTiss({
    temPaciente: !!guia.patient_id,
    insurance: guia.insurance ?? null,
    procedure_code: guia.procedure_code ?? null,
    amount: Number(guia.amount ?? 0),
    validation_note: guia.validation_note ?? null,
  });

  const { error } = await supabase
    .from("tiss_guides")
    .update({ status: validacao, validation_note: nota })
    .eq("id", idParsed.data);

  if (error) return { error: error.message };

  revalidateFaturamento();
  return { ok: true, validacao };
}

const conciliarSchema = z.object({
  id: idSchema,
  resultado: z.enum(["aceita", "glosa"]),
  glosaValor: z.number().finite().nonnegative().default(0),
  glosaMotivo: z.string().max(240).optional(),
});

/**
 * Concilia uma guia TISS no retorno da operadora:
 *  - "aceita": guia validada, glosa zerada, conta a receber confirmada;
 *  - "glosa": registra valor + motivo da glosa e marca o evento como glosado.
 * Restrito ao gestor (lida com valores a receber).
 */
export async function conciliarGuia(
  id: string,
  resultado: "aceita" | "glosa",
  glosaValor = 0,
  glosaMotivo?: string,
): Promise<ActionState> {
  const parsed = conciliarSchema.safeParse({
    id,
    resultado,
    glosaValor,
    glosaMotivo,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  if (!(await isGestor())) {
    return { error: "Apenas o gestor pode conciliar guias." };
  }
  if (parsed.data.resultado === "glosa" && parsed.data.glosaValor <= 0) {
    return { error: "Informe o valor glosado." };
  }

  const supabase = await createClient();
  const isGlosa = parsed.data.resultado === "glosa";
  const { error } = await supabase
    .from("tiss_guides")
    .update({
      status: isGlosa ? "erro" : "validada",
      glosa_amount: isGlosa ? parsed.data.glosaValor : 0,
      glosa_reason: isGlosa ? (parsed.data.glosaMotivo ?? "Glosa registrada") : null,
      reconciled_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id);

  if (error) return { error: error.message };

  revalidateFaturamento();
  return { ok: true };
}

/**
 * Gera o lote XML TISS de verdade: monta a string XML (padrão simplificado)
 * com as guias VALIDADAS do lote, persiste a geração (status enviado +
 * carimbo) e DEVOLVE o conteúdo para download client-side (blob).
 * STUB de transmissão: o arquivo é gerado e baixado, sem envio à operadora.
 */
export async function gerarLoteXML(id: string): Promise<GerarLoteState> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  // Gate financeiro/TISS server-side (defesa em profundidade sobre a RLS): gerar
  // o lote XML é operação do gestor de faturamento.
  if (!(await isGestor())) {
    return { error: "Apenas o gestor pode gerar o lote XML TISS." };
  }



  const supabase = await createClient();

  const { data: lote, error: loteErr } = await supabase
    .from("tiss_batches")
    .select("id, code, insurance")
    .eq("id", parsed.data)
    .maybeSingle();
  if (loteErr) return { error: loteErr.message };
  if (!lote) return { error: "Lote não encontrado." };

  // Apenas guias VALIDADAS entram no lote enviado.
  const { data: guias, error: guiasErr } = await supabase
    .from("tiss_guides")
    .select("guide_number, insurance, procedure_code, amount, status, patients(full_name)")
    .eq("batch_id", lote.id)
    .eq("status", "validada");
  if (guiasErr) return { error: guiasErr.message };

  const guiasXml: GuiaXML[] = (guias ?? []).map((g) => {
    const patient = Array.isArray(g.patients) ? g.patients[0] : g.patients;
    return {
      numero: g.guide_number ?? "—",
      paciente: patient?.full_name ?? "—",
      convenio: g.insurance ?? lote.insurance ?? "—",
      procedimento: g.procedure_code ?? "—",
      valor: Number(g.amount ?? 0),
    };
  });

  if (guiasXml.length === 0) {
    return { error: "Não há guias validadas neste lote para gerar o XML." };
  }

  const xml = gerarLoteTissXML({
    loteCodigo: lote.code ?? "LOTE",
    convenio: lote.insurance ?? "—",
    guias: guiasXml,
  });

  const total = guiasXml.reduce((acc, g) => acc + g.valor, 0);
  const { error } = await supabase
    .from("tiss_batches")
    .update({
      status: "enviado",
      xml_generated_at: new Date().toISOString(),
      guides_count: guiasXml.length,
      total,
    })
    .eq("id", lote.id);
  if (error) return { error: error.message };

  revalidateFaturamento();
  return { ok: true, xml, nomeArquivo: lote.code ?? "LOTE" };
}
