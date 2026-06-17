import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";

// ════════════════════════════════════════════════════════════════
// Data layer do histórico de notificações disparadas (notification_log,
// migration 0035/0041). Cada linha = uma tentativa de envio (e-mail/SMS/
// WhatsApp) com o status REAL do ambiente. Leitura server-side; a RLS
// (notification_log_*) já isola por clínica (tenant). Demo → amostra.
//
// NÃO confundir com `getNotificacoes()` (dashboard), que são PENDÊNCIAS
// operacionais derivadas (fila/estoque/fatura) exibidas no painel do sino.
// Aqui é a AUDITORIA dos disparos — alimenta a rota /notificacoes.
// ════════════════════════════════════════════════════════════════

export type NotifCanal = "email" | "sms" | "whatsapp";
export type NotifStatus =
  | "enviado"
  | "pendente"
  | "nao_configurado"
  | "desativado"
  | "erro";

export type NotificationLogItem = {
  id: string;
  canal: NotifCanal;
  /** Slug do template (ex.: agendamento_confirmado). */
  template: string;
  /** Destino já MASCARADO pela aplicação na gravação (LGPD). */
  destino: string | null;
  provider: string | null;
  status: NotifStatus;
  error: string | null;
  /** ISO do envio (só quando enviado) ou da criação do registro. */
  timestampISO: string | null;
  patientId: string | null;
};

const DEMO_LOG: NotificationLogItem[] = [
  {
    id: "demo-1",
    canal: "whatsapp",
    template: "agendamento_confirmado",
    destino: "(11) *****-1234",
    provider: "whatsapp-stub",
    status: "enviado",
    error: null,
    timestampISO: "2026-06-16T13:40:00.000Z",
    patientId: null,
  },
  {
    id: "demo-2",
    canal: "email",
    template: "lembrete_consulta",
    destino: "m****@gmail.com",
    provider: "resend",
    status: "enviado",
    error: null,
    timestampISO: "2026-06-16T11:05:00.000Z",
    patientId: null,
  },
  {
    id: "demo-3",
    canal: "sms",
    template: "lembrete_consulta",
    destino: "(11) *****-9876",
    provider: "sms-stub",
    status: "nao_configurado",
    error: "Provedor de SMS não configurado.",
    timestampISO: "2026-06-15T18:20:00.000Z",
    patientId: null,
  },
  {
    id: "demo-4",
    canal: "whatsapp",
    template: "resultado_exame",
    destino: "(11) *****-1234",
    provider: null,
    status: "desativado",
    error: null,
    timestampISO: "2026-06-15T09:00:00.000Z",
    patientId: null,
  },
];

/**
 * Lista o histórico de notificações disparadas da clínica ativa (mais
 * recentes primeiro). RLS isola por tenant; só staff lê. Demo/erro → amostra
 * (demo) ou lista vazia (erro). `limit` controla a página única (sem cursor).
 */
export async function listNotificationLog(
  limit = 50,
): Promise<NotificationLogItem[]> {
  if (isDemoMode()) return DEMO_LOG.slice(0, limit);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("notification_log")
      .select(
        "id, channel, template, destination, provider, status, error, sent_at, created_at, patient_id",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((r) => ({
      id: r.id as string,
      canal: (r.channel as NotifCanal) ?? "email",
      template: (r.template as string | null) ?? "—",
      destino: (r.destination as string | null) ?? null,
      provider: (r.provider as string | null) ?? null,
      status: (r.status as NotifStatus) ?? "pendente",
      error: (r.error as string | null) ?? null,
      timestampISO:
        (r.sent_at as string | null) ?? (r.created_at as string | null) ?? null,
      patientId: (r.patient_id as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}
