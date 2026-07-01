import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isDemoMode } from '@/lib/supabase/config'
import { getSettings, type NotificationSettings } from '@/lib/data/settings'

/**
 * Dispatcher de NOTIFICAÇÕES (e-mail / SMS / WhatsApp) — camada de adaptador.
 *
 * Filosofia (honestidade): NÃO finge sucesso. Cada chamada SEMPRE registra a
 * intenção em `notification_log` e o status reflete a realidade do ambiente:
 *
 *   - `enviado`          → provider REAL configurado e a entrega foi aceita.
 *   - `pendente`         → provider configurado como STUB (registrado, aguardando
 *                          integração real do canal).
 *   - `nao_configurado`  → nenhum provider para o canal (só registra a intenção).
 *   - `desativado`       → evento desligado em clinic_settings.notifications:
 *                          NÃO dispara nem registra (não houve tentativa).
 *   - `erro`             → provider real configurado, mas a chamada falhou.
 *
 * Providers são plugáveis por ENV. Hoje só E-MAIL tem provider real (Resend via
 * HTTPS); SMS e WhatsApp são stubs honestos (registram, não entregam). Trocar o
 * stub por um provider real = implementar a função de envio do canal.
 *
 * Server-only: usa o cliente de servidor (RLS + carimbo de clinic_id) e lê
 * segredos de ENV — NUNCA deve chegar ao browser.
 */

export type Canal = 'email' | 'sms' | 'whatsapp'
export type StatusEnvio =
  | 'enviado'
  | 'pendente'
  | 'nao_configurado'
  | 'desativado'
  | 'erro'

/** Eventos de notificação configuráveis (espelha clinic_settings.notifications). */
export type EventoNotificacao = keyof NotificationSettings

const enviarSchema = z.object({
  canal: z.enum(['email', 'sms', 'whatsapp']),
  destino: z.string().trim().min(1, 'Destino obrigatório.').max(160),
  template: z.string().trim().min(1).max(64),
  // Variáveis do template (livre, mas limitado p/ não logar payloads gigantes).
  payload: z.record(z.string(), z.unknown()).default({}),
  // Vínculos opcionais p/ auditoria.
  protocol: z.string().trim().max(64).optional(),
  patientId: z.string().uuid().optional(),
  // Evento configurável: quando informado, o envio respeita o toggle do
  // gestor em clinic_settings.notifications (canal desligado → não dispara).
  evento: z
    .enum([
      'emailNewAppointment',
      'confirmOneDayBefore',
      'smsTwoHoursBefore',
      'whatsappResults',
      'stockAlerts',
      'invoiceAlerts',
    ])
    .optional(),
})

export type EnviarInput = z.input<typeof enviarSchema>
export type EnviarResult = {
  status: StatusEnvio
  provider: string
  error?: string
  /** id do registro em notification_log (ausente em modo demo). */
  logId?: string
}

// ── Templates (render mínimo, sem dado sensível em texto livre) ────
type Rendered = { assunto: string; corpo: string }
type TemplateFn = (p: Record<string, unknown>) => Rendered

const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : fallback

const TEMPLATES: Record<string, TemplateFn> = {
  // Comprovante de agendamento (escopo 7.2).
  comprovante_agendamento: (p) => ({
    assunto: `Comprovante de agendamento ${str(p.protocolo, '')}`.trim(),
    corpo:
      `Seu agendamento foi confirmado.\n` +
      `Protocolo: ${str(p.protocolo, '—')}\n` +
      (p.data ? `Data/Hora: ${str(p.data)}\n` : '') +
      (p.profissional ? `Profissional: ${str(p.profissional)}\n` : '') +
      `Apresente o protocolo (ou o QR Code do comprovante) na recepção.`,
  }),
  // Resultado de exame concluído (envio ao paciente por e-mail).
  resultado_exame: (p) => ({
    assunto: `Resultado do exame ${str(p.exame, '')}`.trim(),
    corpo:
      (p.paciente ? `Olá, ${str(p.paciente)}.\n\n` : '') +
      `O resultado do seu exame está disponível.\n` +
      `Exame: ${str(p.exame, '—')}\n` +
      `Status: Concluído\n` +
      (p.observacoes ? `\nObservações:\n${str(p.observacoes)}\n` : '') +
      `\nEm caso de dúvidas, procure a sua clínica.`,
  }),
}

function render(template: string, payload: Record<string, unknown>): Rendered {
  const fn = TEMPLATES[template]
  if (fn) return fn(payload)
  // Template desconhecido: corpo genérico, sem quebrar o fluxo.
  return {
    assunto: `Notificação (${template})`,
    corpo: 'Você tem uma nova notificação da clínica.',
  }
}

// ── Resolução de provider por canal (via ENV) ─────────────────────
type ProviderKind = 'real' | 'stub' | 'none'
type ProviderInfo = { name: string; kind: ProviderKind }

function resolveProvider(canal: Canal): ProviderInfo {
  if (canal === 'email') {
    if (process.env.RESEND_API_KEY && process.env.NOTIFICATIONS_EMAIL_FROM) {
      return { name: 'resend', kind: 'real' }
    }
    return { name: 'email', kind: 'none' }
  }
  if (canal === 'sms') {
    // Sem implementação real ainda: se houver chave, registra como STUB.
    return process.env.SMS_API_KEY
      ? { name: 'sms-stub', kind: 'stub' }
      : { name: 'sms', kind: 'none' }
  }
  // whatsapp
  return process.env.WHATSAPP_API_KEY
    ? { name: 'whatsapp-stub', kind: 'stub' }
    : { name: 'whatsapp', kind: 'none' }
}

// ── Provider real: e-mail via Resend (HTTPS) ──────────────────────
async function sendEmailResend(
  to: string,
  msg: Rendered,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.NOTIFICATIONS_EMAIL_FROM,
        to: [to],
        subject: msg.assunto,
        text: msg.corpo,
      }),
    })
    if (!res.ok) {
      // Não logamos o corpo da resposta para evitar vazar PII/segredo.
      return { ok: false, error: `Provider e-mail retornou HTTP ${res.status}.` }
    }
    return { ok: true }
  } catch {
    // Sem detalhe de rede no log (LGPD / superfície de erro).
    return { ok: false, error: 'Falha de rede ao contatar o provider de e-mail.' }
  }
}

/**
 * Mascara o destino para o LOG (LGPD): nunca persistimos e-mail/telefone
 * completos. Ex.: "joao@x.com" → "j***@x.com"; "+5511998887777" → "***7777".
 */
function maskDestino(canal: Canal, destino: string): string {
  if (canal === 'email') {
    const [user, domain] = destino.split('@')
    if (!domain) return '***'
    return `${user.slice(0, 1)}***@${domain}`
  }
  const tail = destino.replace(/\D/g, '').slice(-4)
  return tail ? `***${tail}` : '***'
}

/**
 * Persiste UMA linha em notification_log (auditoria). Destino é MASCARADO (LGPD).
 * Centraliza o shape do insert para os dois caminhos (envio normal e evento
 * 'desativado'). Devolve o id gerado ou sinaliza falha de auditoria.
 */
async function persistLog(params: {
  canal: Canal
  template: string
  destino: string
  provider: string
  status: StatusEnvio
  error?: string
  protocol?: string
  patientId?: string
  payload: Record<string, unknown>
}): Promise<{ logId?: string } | { dbError: true }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notification_log')
    .insert({
      channel: params.canal,
      template: params.template,
      destination: maskDestino(params.canal, params.destino),
      provider: params.provider,
      status: params.status,
      error: params.error ?? null,
      protocol: params.protocol ?? null,
      patient_id: params.patientId ?? null,
      // payload sem PII bruta: já vem como variáveis de template (sem destino).
      payload: params.payload,
      sent_at: params.status === 'enviado' ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  if (error) return { dbError: true }
  return { logId: data?.id }
}

/**
 * Envia (ou registra a intenção de envio de) uma notificação.
 * SEMPRE persiste em notification_log, exceto em modo demo (sem banco), onde
 * apenas resolve o status que ocorreria.
 */
export async function enviarNotificacao(
  input: EnviarInput,
): Promise<EnviarResult> {
  const parsed = enviarSchema.safeParse(input)
  if (!parsed.success) {
    return {
      status: 'erro',
      provider: 'validacao',
      error: parsed.error.issues[0]?.message ?? 'Entrada inválida.',
    }
  }
  const { canal, destino, template, payload, protocol, patientId, evento } =
    parsed.data

  // Gate por configuração (clinic_settings.notifications): se o evento foi
  // desligado pelo gestor, NÃO dispara o canal — mas REGISTRA a tentativa como
  // 'desativado' para auditoria completa (a migration 0041 incluiu esse valor
  // no CHECK de notification_log.status). Em modo demo não há onde persistir.
  if (evento) {
    const settings = await getSettings()
    if (!settings.notifications[evento]) {
      if (isDemoMode()) return { status: 'desativado', provider: 'config' }
      const res = await persistLog({
        canal,
        template,
        destino,
        provider: 'config',
        status: 'desativado',
        protocol,
        patientId,
        payload,
      })
      if ('dbError' in res) {
        return {
          status: 'erro',
          provider: 'config',
          error: 'Não foi possível registrar a notificação.',
        }
      }
      return { status: 'desativado', provider: 'config', logId: res.logId }
    }
  }

  const provider = resolveProvider(canal)
  const msg = render(template, payload)

  // Decide o status conforme o provider e tenta a entrega real se houver.
  let status: StatusEnvio
  let error: string | undefined

  if (provider.kind === 'none') {
    status = 'nao_configurado'
  } else if (provider.kind === 'stub') {
    status = 'pendente' // registrado; aguarda integração real do canal
  } else {
    // Provider real (hoje só e-mail/Resend).
    const out = await sendEmailResend(destino, msg)
    if (out.ok) {
      status = 'enviado'
    } else {
      status = 'erro'
      error = out.error
    }
  }

  // Modo demo (sem Supabase): não há onde persistir; devolve o status resolvido.
  if (isDemoMode()) {
    return { status, provider: provider.name, error }
  }

  // Persistência da intenção/resultado (auditável). Destino é MASCARADO (LGPD).
  const res = await persistLog({
    canal,
    template,
    destino,
    provider: provider.name,
    status,
    error,
    protocol,
    patientId,
    payload,
  })

  if ('dbError' in res) {
    // Falha de auditoria não deve "fingir" entrega: reporta erro de registro.
    return {
      status: 'erro',
      provider: provider.name,
      error: 'Não foi possível registrar a notificação.',
    }
  }

  return { status, provider: provider.name, error, logId: res.logId }
}
