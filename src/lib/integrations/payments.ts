'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isGestor, getCurrentUser } from '@/lib/auth'
import { requireClinic } from '@/lib/tenant'

/**
 * Registro de PAGAMENTO PARTICULAR (escopo 13) — camada de adaptador.
 *
 * Honestidade: NÃO confirma pagamento por conta própria. Toda cobrança nasce
 * `pendente`. A confirmação só ocorre por:
 *   - um GATEWAY real (webhook/conciliação) — não temos PSP integrado ainda; ou
 *   - confirmação MANUAL do gestor (recebimento conferido na clínica).
 *
 * Gateway é plugável por ENV (`PAYMENT_GATEWAY`). Sem gateway configurado, o
 * provider é `manual` (cobrança registrada, confirmada à mão). Com gateway
 * configurado, hoje ele é um STUB honesto: gera uma referência interna e
 * mantém o status `pendente` (jamais inventa confirmação).
 */

export type MetodoPagamento = 'pix' | 'cartao' | 'boleto'
export type StatusPagamento = 'pendente' | 'confirmado' | 'falhou' | 'cancelado'

export type PaymentActionState =
  | {
      error?: string
      ok?: boolean
      paymentId?: string
      status?: StatusPagamento
      /** Referência da cobrança (txid/nsu/linha digitável) quando houver. */
      identificador?: string
    }
  | undefined

const registrarSchema = z.object({
  // Vínculo opcional com o evento faturável (código de negócio).
  eventCode: z.string().trim().max(64).optional(),
  metodo: z.enum(['pix', 'cartao', 'boleto']),
  valor: z.number().finite().positive('Valor deve ser maior que zero.'),
})

export type RegistrarPagamentoInput = z.input<typeof registrarSchema>

/** Provider de pagamento resolvido por ENV. */
function resolveGateway(): { name: string; isReal: boolean } {
  const gw = (process.env.PAYMENT_GATEWAY ?? '').trim().toLowerCase()
  if (!gw) return { name: 'manual', isReal: false }
  // Hoje qualquer valor de PAYMENT_GATEWAY é tratado como STUB (sem PSP real).
  return { name: gw, isReal: false }
}

/**
 * Gera uma referência INTERNA de cobrança (não é um EMV/PIX pagável real).
 * Serve para rastrear a cobrança até a integração com um PSP de verdade.
 */
function gerarReferencia(metodo: MetodoPagamento): string {
  const rnd = Math.random().toString(36).slice(2, 10).toUpperCase()
  return `${metodo.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${rnd}`
}

function revalidateFaturamento() {
  revalidatePath('/faturamento')
  revalidatePath('/dashboard')
}

/**
 * Registra uma cobrança particular. Cria o registro em `payments` com status
 * SEMPRE `pendente`. Devolve a referência da cobrança (interna, no stub).
 * Restrito a staff (RLS exige is_staff(); aqui exigimos sessão).
 */
export async function registrarPagamento(
  input: RegistrarPagamentoInput,
): Promise<PaymentActionState> {
  const parsed = registrarSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }
  const { eventCode, metodo, valor } = parsed.data

  const current = await getCurrentUser()
  if (!current) return { error: 'Sessão expirada.' }

  const gateway = resolveGateway()
  const identificador = gerarReferencia(metodo)
  const supabase = await createClient()
  const clinicId = await requireClinic()

  // Resolve o evento faturável (opcional) pelo código de negócio.
  let eventId: string | null = null
  if (eventCode) {
    const { data: evt } = await supabase
      .from('billable_events')
      .select('id')
      .eq('code', eventCode)
      .maybeSingle()
    eventId = evt?.id ?? null
  }

  const { data, error } = await supabase
    .from('payments')
    .insert({
      clinic_id: clinicId,
      event_id: eventId,
      method: metodo,
      status: 'pendente',
      amount: valor,
      provider: gateway.name,
      external_id: identificador,
      created_by: current.userId,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidateFaturamento()
  return {
    ok: true,
    paymentId: data?.id,
    status: 'pendente',
    identificador,
  }
}

const confirmarSchema = z.object({
  paymentId: z.string().uuid('Pagamento inválido.'),
  resultado: z.enum(['confirmado', 'falhou', 'cancelado']),
})

/**
 * Atualiza o status de uma cobrança. Como NÃO há gateway real, esta é a via de
 * confirmação MANUAL (recebimento conferido) — restrita ao gestor. Marca
 * `confirmed_at` quando confirmado. Nunca é chamada automaticamente.
 */
export async function atualizarStatusPagamento(
  paymentId: string,
  resultado: 'confirmado' | 'falhou' | 'cancelado',
): Promise<PaymentActionState> {
  const parsed = confirmarSchema.safeParse({ paymentId, resultado })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  if (!(await isGestor())) {
    return { error: 'Apenas o gestor pode confirmar ou cancelar pagamentos.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('payments')
    .update({
      status: parsed.data.resultado,
      confirmed_at:
        parsed.data.resultado === 'confirmado'
          ? new Date().toISOString()
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.paymentId)

  if (error) return { error: error.message }

  revalidateFaturamento()
  return { ok: true, status: parsed.data.resultado }
}
