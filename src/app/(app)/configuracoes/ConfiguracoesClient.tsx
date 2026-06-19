"use client";

import {
  useState,
  useActionState,
  useEffect,
  useTransition,
  useRef,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Building2,
  SlidersHorizontal,
  Save,
  Bell,
  ShieldCheck,
  DatabaseBackup,
  Download,
  Play,
  Palette,
  Upload,
  RotateCcw,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmBreve } from "@/components/ui/EmBreve";
import { salvarConfiguracoes, executarBackup } from "@/lib/actions/settings";
import { uploadLogo } from "@/lib/actions/branding";
import { changePassword } from "@/lib/actions/account";
import { buildSenhaSchema, normalizePolicy } from "@/lib/validation/password";
import type { ClinicSettings } from "@/lib/data/settings";
import type { AnamneseTemplate } from "@/lib/data/anamnese-templates.shared";
import { AnamneseBuilder } from "./AnamneseBuilder";

const BASE_TABS = [
  "Geral",
  "Notificações",
  "Segurança",
  "Backup",
  "Marca",
  "Anamnese",
] as const;

const ATENDIMENTO_TAB = "Dados de Atendimento";

export function ConfiguracoesClient({
  settings,
  anamneseTemplates,
}: {
  settings: ClinicSettings;
  anamneseTemplates: AnamneseTemplate[];
}) {
  const [tabAtiva, setTabAtiva] = useState<Tab>("Geral");
  const [state, formAction, pending] = useActionState(
    salvarConfiguracoes,
    undefined,
  );
  const router = useRouter();

  // Logo (white-label): lido como data URL e enviado num input hidden.
  const [logoUrl, setLogoUrl] = useState<string | null>(settings.branding.logoUrl);

  // Backup "Executar agora" (stub) via Server Action separada.
  const [bkpPending, startBackup] = useTransition();

  useEffect(() => {
    if (state?.ok) {
      toast.success("Configurações salvas com sucesso!");
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      toast.error("Logo muito grande (máximo 512 KB).");
      e.target.value = "";
      return;
    }
    // Preview imediato (data URL) — também é o fallback se o Storage não existir.
    const reader = new FileReader();
    reader.onload = () => setLogoUrl(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);

    // Upload para o Supabase Storage; se devolver URL pública, prefere a URL
    // (mais leve que persistir um data URL gigante no JSONB).
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadLogo(fd);
    if (res.error) toast.error(res.error);
    else if (res.url) setLogoUrl(res.url);
  }

  function onExecutarBackup() {
    startBackup(async () => {
      const res = await executarBackup();
      if (res?.ok) {
        toast.success("Backup iniciado. Registrado o horário de execução.");
        router.refresh();
      } else if (res?.error) {
        toast.error(res.error);
      }
    });
  }

  function onBaixarBackup() {
    // Stub claro: gera um manifesto local e oferece download (sem serviço externo).
    const manifesto = {
      clinica: settings.clinicName,
      gerado_em: new Date().toISOString(),
      frequencia: settings.backup.frequency,
      retencao_dias: settings.backup.retentionDays,
      ultimo_backup: settings.backup.lastRunAt,
      observacao:
        "Manifesto de backup (protótipo). A cópia real é responsabilidade da infraestrutura.",
    };
    const blob = new Blob([JSON.stringify(manifesto, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-manifesto-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Manifesto de backup baixado.");
  }

  const lastBackup = settings.backup.lastRunAt
    ? new Date(settings.backup.lastRunAt).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Nunca";

  return (
    <>
      <PageHeader
        title="Configurações"
        subtitle="Personalize e configure o sistema de acordo com as necessidades da clínica"
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setTabAtiva(tab)}
            className={
              tabAtiva === tab
                ? "rounded-full bg-brand-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm"
                : "rounded-full px-4 py-1.5 text-sm font-medium text-muted hover:bg-canvas hover:text-ink"
            }
          >
            {tab}
          </button>
        ))}
      </div>

      {/* TUDO num único formulário: cada aba é só uma "vista" — os campos das
          abas inativas continuam no DOM (escondidos) para serem enviados juntos
          num único submit. */}
      <form action={formAction}>
        {/* ── Geral + Preferências ───────────────────────────────── */}
        <TabPane active={tabAtiva === "Geral"}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardBody>
                <BlocoHeader
                  icon={<Building2 className="h-5 w-5" />}
                  tone="bg-brand-50 text-brand-600"
                  title="Informações da Clínica"
                  subtitle="Dados institucionais"
                />
                <div className="space-y-4">
                  <Input
                    id="nome-clinica"
                    name="clinic_name"
                    label="Nome da Clínica"
                    defaultValue={settings.clinicName}
                    required
                  />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input id="cnpj" name="cnpj" label="CNPJ" defaultValue={settings.cnpj} />
                    <Input id="telefone" name="phone" label="Telefone" defaultValue={settings.phone} />
                  </div>
                  <Input id="email" name="email" label="E-mail" type="email" defaultValue={settings.email} />
                  <Input id="endereco" name="address" label="Endereço" defaultValue={settings.address} />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input id="cep" name="cep" label="CEP" defaultValue={settings.cep} />
                    <Input id="horario" name="business_hours" label="Horário de Funcionamento" defaultValue={settings.businessHours} />
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <BlocoHeader
                  icon={<SlidersHorizontal className="h-5 w-5" />}
                  tone="bg-purple-50 text-purple-600"
                  title="Preferências do Sistema"
                  subtitle="Configurações operacionais"
                />
                <div className="space-y-4">
                  <Select id="idioma" name="language" label="Idioma do Sistema" defaultValue={settings.language}>
                    <option value="pt-BR">Português (Brasil)</option>
                    <option value="en-US">English (US)</option>
                    <option value="es-ES">Español</option>
                  </Select>
                  <Select id="fuso" name="timezone" label="Fuso Horário" defaultValue={settings.timezone}>
                    <option value="gmt-3">América/São Paulo (GMT-3)</option>
                    <option value="gmt-4">América/Manaus (GMT-4)</option>
                    <option value="gmt-5">América/Rio Branco (GMT-5)</option>
                  </Select>
                  <Select id="formato-data" name="date_format" label="Formato de Data" defaultValue={settings.dateFormat}>
                    <option value="dmy">DD/MM/AAAA</option>
                    <option value="mdy">MM/DD/AAAA</option>
                    <option value="ymd">AAAA-MM-DD</option>
                  </Select>
                  <Select id="formato-hora" name="time_format" label="Formato de Hora" defaultValue={settings.timeFormat}>
                    <option value="24h">24 horas</option>
                    <option value="12h">12 horas (AM/PM)</option>
                  </Select>
                  <Select id="moeda" name="currency" label="Moeda Padrão" defaultValue={settings.currency}>
                    <option value="brl">BRL - Real Brasileiro (R$)</option>
                    <option value="usd">USD - Dólar Americano (US$)</option>
                    <option value="eur">EUR - Euro (€)</option>
                  </Select>
                </div>
              </CardBody>
            </Card>
          </div>
        </TabPane>

        {/* ── Notificações (por evento) ──────────────────────────── */}
        <TabPane active={tabAtiva === "Notificações"}>
          <Card className="max-w-2xl">
            <CardBody>
              <BlocoHeader
                icon={<Bell className="h-5 w-5" />}
                tone="bg-blue-50 text-blue-600"
                title="Notificações"
                subtitle="Avisos automáticos ao paciente e à equipe"
              />
              <div className="space-y-3">
                <ToggleRow
                  name="notif_email_new"
                  label="E-mail de nova consulta"
                  desc="Enviar e-mail ao agendar uma nova consulta"
                  defaultChecked={settings.notifications.emailNewAppointment}
                  badge={<EmBreve label="Em breve — envio real" />}
                />
                <ToggleRow
                  name="notif_confirm_1d"
                  label="Confirmação 1 dia antes"
                  desc="Lembrete de confirmação um dia antes da consulta"
                  defaultChecked={settings.notifications.confirmOneDayBefore}
                  badge={<EmBreve label="Em breve — envio real" />}
                />
                <ToggleRow
                  name="notif_sms_2h"
                  label="SMS 2 horas antes"
                  desc="Lembrete por SMS duas horas antes da consulta"
                  defaultChecked={settings.notifications.smsTwoHoursBefore}
                  badge={<EmBreve label="Em breve — SMS real" />}
                />
                <ToggleRow
                  name="notif_whatsapp_results"
                  label="WhatsApp de resultados"
                  desc="Avisar o paciente via WhatsApp quando houver resultados"
                  defaultChecked={settings.notifications.whatsappResults}
                  badge={<EmBreve label="Em breve — WhatsApp real" />}
                />
                <ToggleRow
                  name="notif_stock"
                  label="Avisos de estoque"
                  desc="Notificar a equipe sobre itens com estoque baixo/crítico"
                  defaultChecked={settings.notifications.stockAlerts}
                />
                <ToggleRow
                  name="notif_invoice"
                  label="Avisos de faturas"
                  desc="Notificar o gestor sobre faturas pendentes"
                  defaultChecked={settings.notifications.invoiceAlerts}
                />
              </div>
            </CardBody>
          </Card>
        </TabPane>

        {/* ── Segurança ──────────────────────────────────────────── */}
        <TabPane active={tabAtiva === "Segurança"}>
          <Card className="max-w-2xl">
            <CardBody>
              <BlocoHeader
                icon={<ShieldCheck className="h-5 w-5" />}
                tone="bg-green-50 text-green-600"
                title="Segurança"
                subtitle="Autenticação, política de senhas e sessão"
              />
              <div className="space-y-4">
                <ToggleRow
                  name="sec_two_factor"
                  label="Autenticação em dois fatores (2FA)"
                  desc="Exigir segundo fator no login da equipe"
                  defaultChecked={settings.security.twoFactor}
                  badge={<EmBreve label="Em breve — 2FA real" />}
                />
                <Select
                  id="pol-senha"
                  name="sec_password_policy"
                  label="Política de senha"
                  defaultValue={settings.security.passwordPolicy}
                >
                  <option value="baixa">Baixa (mínimo 6 caracteres)</option>
                  <option value="media">Média (8+ com número)</option>
                  <option value="alta">Alta (10+ com símbolo)</option>
                </Select>
                <Input
                  id="sec-timeout"
                  name="sec_session_timeout"
                  label="Timeout de sessão (minutos)"
                  type="number"
                  min={5}
                  max={1440}
                  defaultValue={settings.security.sessionTimeoutMin}
                />
              </div>
            </CardBody>
          </Card>
        </TabPane>

        {/* ── Backup ─────────────────────────────────────────────── */}
        <TabPane active={tabAtiva === "Backup"}>
          <Card className="max-w-2xl">
            <CardBody>
              <BlocoHeader
                icon={<DatabaseBackup className="h-5 w-5" />}
                tone="bg-orange-50 text-orange-600"
                title="Backup e Restauração"
                subtitle="Rotinas e indicadores de cópia de segurança"
              />
              <div className="mb-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-line bg-muted-surface p-4">
                  <div className="text-xs text-muted">Último backup</div>
                  <div className="mt-1 font-semibold text-ink">{lastBackup}</div>
                </div>
                <div className="rounded-xl border border-line bg-muted-surface p-4">
                  <div className="text-xs text-muted">Status</div>
                  <div className="mt-1 font-semibold text-green-600">
                    {settings.backup.lastRunAt ? "Em dia" : "Pendente"}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <Select
                  id="bkp-freq"
                  name="bkp_frequency"
                  label="Frequência"
                  defaultValue={settings.backup.frequency}
                >
                  <option value="diario">Diário</option>
                  <option value="semanal">Semanal</option>
                  <option value="mensal">Mensal</option>
                </Select>
                <Input
                  id="bkp-ret"
                  name="bkp_retention"
                  label="Retenção (dias)"
                  type="number"
                  min={1}
                  max={3650}
                  defaultValue={settings.backup.retentionDays}
                />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button type="button" variant="primary" onClick={onExecutarBackup} disabled={bkpPending}>
                  <Play className="h-4 w-4" /> {bkpPending ? "Executando..." : "Executar agora"}
                </Button>
                <Button type="button" variant="outline" onClick={onBaixarBackup}>
                  <Download className="h-4 w-4" /> Baixar último
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => toast.info("Restauração disponível apenas via suporte (protótipo).")}
                >
                  <RotateCcw className="h-4 w-4" /> Restaurar
                </Button>
              </div>
              <EmBreve
                variant="banner"
                label="Em breve — backup e restauração reais (cópia executada pela infraestrutura)."
                className="mt-4"
              />
            </CardBody>
          </Card>
        </TabPane>

        {/* ── Marca / White-label ────────────────────────────────── */}
        <TabPane active={tabAtiva === "Marca"}>
          <Card className="max-w-2xl">
            <CardBody>
              <BlocoHeader
                icon={<Palette className="h-5 w-5" />}
                tone="bg-purple-50 text-purple-600"
                title="Marca (White-label)"
                subtitle="Tema, paleta e logotipo da clínica"
              />
              <div className="space-y-4">
                <Select
                  id="brand-theme"
                  name="brand_theme"
                  label="Tema da interface"
                  defaultValue={settings.branding.theme}
                >
                  <option value="claro">Claro</option>
                  <option value="escuro">Escuro</option>
                  <option value="auto">Automático (sistema)</option>
                </Select>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <ColorField
                    id="brand-primary"
                    name="brand_primary"
                    label="Cor primária"
                    defaultValue={settings.branding.primaryColor}
                  />
                  <ColorField
                    id="brand-accent"
                    name="brand_accent"
                    label="Cor de destaque"
                    defaultValue={settings.branding.accentColor}
                  />
                </div>

                <div>
                  <span className="mb-1.5 block text-sm font-medium text-ink">Logotipo</span>
                  <div className="flex items-center gap-4 rounded-xl border border-line p-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted-surface">
                      {logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoUrl} alt="Logo da clínica" className="h-full w-full object-contain" />
                      ) : (
                        <Building2 className="h-7 w-7 text-muted" />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <LogoPicker onChange={onLogoChange} />
                      {logoUrl && (
                        <Button type="button" variant="outline" onClick={() => setLogoUrl(null)}>
                          Remover
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">PNG/JPG/SVG, até 512 KB.</p>
                  {/* Logo enviado como data URL num input hidden. */}
                  <input type="hidden" name="brand_logo" value={logoUrl ?? ""} />
                </div>
              </div>
            </CardBody>
          </Card>
        </TabPane>

        {tabAtiva !== "Anamnese" && (
          <div className="mt-6 flex justify-end">
            <Button type="submit" variant="primary" disabled={pending}>
              <Save className="h-4 w-4" />
              {pending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        )}
      </form>

      {/* Dados de Atendimento — parametrização (gestor). Fora do form de
          configurações: usa Server Actions próprias com revalidate. */}
      {gestor && tabAtiva === ATENDIMENTO_TAB && (
        <AtendimentoOpcoes options={attendanceOptions} />
      )}

      {/* Troca da PRÓPRIA senha — formulário independente (fora do form de
          configurações, que é gestor-only). Vive na aba Segurança. */}
      {tabAtiva === "Segurança" && (
        <div className="mt-6">
          <AlterarSenhaCard policy={settings.security.passwordPolicy} />
        </div>
      )}

      {/* Construtor de anamnese — salvamento próprio (Server Action dedicada),
          por isso vive fora do form de configurações. */}
      {tabAtiva === "Anamnese" && (
        <AnamneseBuilder templates={anamneseTemplates} />
      )}
    </>
  );
}

/**
 * Cartão "Alterar minha senha": troca da senha do próprio usuário logado.
 * Validação no client (react-hook-form + Zod, política vigente da clínica) e
 * reforçada no servidor pela action `changePassword` (reautentica antes de trocar).
 */
function AlterarSenhaCard({ policy }: { policy: string }) {
  const schema = useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, "Informe sua senha atual."),
          newPassword: buildSenhaSchema(normalizePolicy(policy)),
          confirmPassword: z.string().min(1, "Confirme a nova senha."),
        })
        .refine((d) => d.newPassword === d.confirmPassword, {
          path: ["confirmPassword"],
          message: "A confirmação não confere com a nova senha.",
        })
        .refine((d) => d.newPassword !== d.currentPassword, {
          path: ["newPassword"],
          message: "A nova senha deve ser diferente da atual.",
        }),
    [policy],
  );

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: FormValues) {
    const res = await changePassword(values);
    if (res.ok) {
      toast.success("Senha alterada com sucesso!");
      reset();
    } else {
      toast.error(res.error ?? "Não foi possível alterar a senha.");
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardBody>
        <BlocoHeader
          icon={<KeyRound className="h-5 w-5" />}
          tone="bg-green-50 text-green-600"
          title="Alterar minha senha"
          subtitle="Troca da sua própria senha de acesso"
        />
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" autoComplete="off">
          <div>
            <Input
              id="senha-atual"
              type="password"
              label="Senha atual"
              autoComplete="current-password"
              {...register("currentPassword")}
            />
            <FieldError msg={errors.currentPassword?.message} />
          </div>
          <div>
            <Input
              id="senha-nova"
              type="password"
              label="Nova senha"
              autoComplete="new-password"
              {...register("newPassword")}
            />
            <FieldError msg={errors.newPassword?.message} />
          </div>
          <div>
            <Input
              id="senha-confirma"
              type="password"
              label="Confirmar nova senha"
              autoComplete="new-password"
              {...register("confirmPassword")}
            />
            <FieldError msg={errors.confirmPassword?.message} />
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              <KeyRound className="h-4 w-4" />
              {isSubmitting ? "Alterando..." : "Alterar senha"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-status-danger">{msg}</p>;
}

/** Mantém os campos no DOM mesmo quando a aba está inativa (escondidos). */
function TabPane({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <div className={active ? "" : "hidden"}>{children}</div>;
}

function LogoPicker({ onChange }: { onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => ref.current?.click()}>
        <Upload className="h-4 w-4" /> Enviar logo
      </Button>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        className="hidden"
        onChange={onChange}
      />
    </>
  );
}

function ColorField({
  id,
  name,
  label,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-surface p-1"
        />
        <input
          id={id}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
    </div>
  );
}

function BlocoHeader({
  icon,
  tone,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-ink">{title}</h3>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function ToggleRow({
  name,
  label,
  desc,
  defaultChecked,
  badge,
}: {
  name: string;
  label: string;
  desc: string;
  defaultChecked?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-line p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink">{label}</span>
          {badge}
        </div>
        <div className="text-xs text-muted">{desc}</div>
      </div>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-5 w-5 rounded border-line text-brand-500 focus:ring-brand-100"
      />
    </label>
  );
}
