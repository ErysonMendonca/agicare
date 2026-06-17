import { Bell, Mail, MessageSquare, Phone } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge, type Status } from "@/components/ui/Badge";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { requireUser } from "@/lib/auth";
import {
  listNotificationLog,
  type NotifCanal,
  type NotifStatus,
} from "@/lib/data/notifications";

/** Ícone por canal de envio. */
const CANAL_ICON: Record<NotifCanal, typeof Bell> = {
  email: Mail,
  sms: Phone,
  whatsapp: MessageSquare,
};

const CANAL_LABEL: Record<NotifCanal, string> = {
  email: "E-mail",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

const TEMPLATE_LABEL: Record<string, string> = {
  agendamento_confirmado: "Agendamento confirmado",
  agendamento_cancelado: "Agendamento cancelado",
  lembrete_consulta: "Lembrete de consulta",
  resultado_exame: "Resultado de exame",
};

/** Status → rótulo + tom do Badge (desativado usa estilo neutro). */
const STATUS_META: Record<
  NotifStatus,
  { label: string; status: Status; className?: string }
> = {
  enviado: { label: "Enviado", status: "ok" },
  pendente: { label: "Pendente", status: "wait" },
  nao_configurado: { label: "Não configurado", status: "warn" },
  desativado: {
    label: "Desativado",
    status: "wait",
    className: "bg-muted-surface text-muted",
  },
  erro: { label: "Erro", status: "danger" },
};

/** dd/mm/aaaa HH:MM local (— quando inválido/ausente). */
function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function templateLabel(slug: string): string {
  return TEMPLATE_LABEL[slug] ?? slug.replace(/_/g, " ");
}

export default async function NotificacoesPage() {
  // Qualquer usuário autenticado (staff) pode ver o histórico da sua clínica;
  // a RLS de notification_log já restringe ao tenant + staff.
  await requireUser();
  const itens = await listNotificationLog(50);

  return (
    <>
      <PageHeader
        title="Notificações"
        subtitle="Histórico de notificações disparadas pela clínica (e-mail, SMS e WhatsApp)"
      />

      {itens.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-5 py-16 text-center">
          <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted-surface text-muted">
            <Bell className="h-7 w-7" />
          </span>
          <p className="font-medium text-ink">Nenhuma notificação registrada</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            As notificações enviadas aos pacientes (confirmações, lembretes e
            resultados) aparecerão aqui.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {/* Cabeçalho de tabela (desktop) */}
          <div className="hidden grid-cols-[1.5fr_2fr_1fr_1.2fr] gap-4 border-b border-line bg-canvas px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted md:grid">
            <span>Canal</span>
            <span>Notificação</span>
            <span>Status</span>
            <span>Horário</span>
          </div>

          <Stagger>
            {itens.map((n) => {
              const Icon = CANAL_ICON[n.canal];
              const meta = STATUS_META[n.status];
              return (
                <FadeInUp key={n.id} className="border-b border-line last:border-b-0">
                  <div className="grid grid-cols-1 gap-2 px-5 py-4 md:grid-cols-[1.5fr_2fr_1fr_1.2fr] md:items-center md:gap-4">
                      {/* Canal */}
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="text-sm font-medium text-ink">
                          {CANAL_LABEL[n.canal]}
                        </span>
                      </div>

                      {/* Notificação (template + destino mascarado) */}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {templateLabel(n.template)}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {n.destino ?? "Destino não informado"}
                          {n.provider ? ` · ${n.provider}` : ""}
                        </p>
                        {n.error && (
                          <p className="truncate text-xs text-red-600">
                            {n.error}
                          </p>
                        )}
                      </div>

                      {/* Status */}
                      <div>
                        <Badge status={meta.status} className={meta.className}>
                          {meta.label}
                        </Badge>
                      </div>

                      {/* Horário */}
                      <div className="text-sm text-muted">
                        {fmtDataHora(n.timestampISO)}
                      </div>
                  </div>
                </FadeInUp>
              );
            })}
          </Stagger>
        </Card>
      )}
    </>
  );
}
