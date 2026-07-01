import {
  FileText,
  Clock,
  Activity,
  CheckCircle2,
  CalendarClock,
  Stethoscope,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { FilaClient } from "@/app/(app)/fila/FilaClient";
import { listQueue, listAgendadosHoje } from "@/lib/data/queue";
import { getMySpecialty, listAtendimentosPorData } from "@/lib/data/prontuario";
import { getCurrentUser, getRole } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { requireView } from "@/lib/permissions";

/** Data local de hoje em yyyy-mm-dd (coerente com <input type="date">). */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default async function ProntuarioPage({
  searchParams,
}: {
  // Next 16: searchParams é assíncrono.
  searchParams: Promise<{
    registro?: string;
    paciente?: string;
    data?: string;
    especialidade?: string;
  }>;
}) {
  await requireView("prontuario");
  const sp = await searchParams;

  // Especialidade-base do profissional logado (null em demo / não-clínico).
  const especialidadeBase = await getMySpecialty();
  const souProfissional = especialidadeBase != null;
  // Médico opera a partir do Prontuário (não tem mais a Fila): "Atender" leva
  // ao prontuário do paciente, igual à Fila.
  const isMedico = (await getRole()) === "medico";
  const { totemEnabled } = await getSettings();
  // Nome do médico logado p/ o default "meus atendimentos" (só se for clínico,
  // evitando chamar getCurrentUser em demo). Leitura apenas.
  const myName = souProfissional
    ? ((await getCurrentUser())?.profile?.full_name ?? null)
    : null;

  // Especialidade efetiva (filtro do usuário sobrepõe o default do profissional).
  const selectedEsp = sp.especialidade ?? especialidadeBase ?? "todas";
  const queueSpecialty = selectedEsp === "todas" ? null : selectedEsp;

  const reg = sp.registro?.trim().toLowerCase() ?? "";
  const pac = sp.paciente?.trim().toLowerCase() ?? "";
  const dataFiltro = sp.data?.trim() ?? "";

  // Fonte de dados conforme a data:
  //  • hoje (ou sem data) → fila viva (listQueue já aplica escopo 'own' no banco);
  //  • data passada → histórico de atendimentos salvos (attendance_records / 0037).
  const isHistorico = Boolean(dataFiltro) && dataFiltro !== hojeISO();
  const base = isHistorico
    ? await listAtendimentosPorData(dataFiltro, { specialty: queueSpecialty })
    : await listQueue({ specialty: queueSpecialty });

  // ── Filtragem na própria page ──────────────────────────────────────────
  let filtrada = base;
  // Default: restringe ao médico logado (não só à especialidade) quando aplicável.
  if (souProfissional && myName) {
    filtrada = filtrada.filter((i) => i.medico === myName);
  }
  if (reg) filtrada = filtrada.filter((i) => i.codigo.toLowerCase().includes(reg));
  if (pac)
    filtrada = filtrada.filter((i) => i.paciente.toLowerCase().includes(pac));

  // "Agendados": pacientes com agendamento de HOJE que ainda não chegaram
  // (status agendado/confirmado, sem check-in) — só faz sentido na visão de
  // hoje (no histórico não há agenda futura a contabilizar).
  let agendadosBase = isHistorico
    ? []
    : await listAgendadosHoje({ specialty: queueSpecialty });
  if (souProfissional && myName) {
    agendadosBase = agendadosBase.filter((i) => i.medico === myName);
  }
  if (reg)
    agendadosBase = agendadosBase.filter((i) =>
      i.codigo.toLowerCase().includes(reg),
    );
  if (pac)
    agendadosBase = agendadosBase.filter((i) =>
      i.paciente.toLowerCase().includes(pac),
    );
  const agendados = agendadosBase.length;

  const todos = filtrada.length;
  const aguardando = filtrada.filter(
    (i) => i.statusRaw === "aguardando" || i.statusRaw === "chamado",
  ).length;
  const emAtendimento = filtrada.filter(
    (i) => i.statusRaw === "em_atendimento",
  ).length;
  const realizados = filtrada.filter(
    (i) => i.statusRaw === "finalizado",
  ).length;

  // Opções de especialidade sem duplicar a base do profissional.
  const espOptions = Array.from(
    new Set([
      ...(especialidadeBase ? [especialidadeBase] : []),
      "Clínica Geral",
      "Cardiologia",
      "Ortopedia",
    ]),
  );

  const temFiltro = Boolean(reg || pac || dataFiltro || sp.especialidade);

  return (
    <>
      <PageHeader
        title="Prontuário Eletrônico Atendimento Ambulatorial"
        subtitle="Gerencie os atendimentos e abra o prontuário dos pacientes"
      />

      {/* Especialidade / escopo aplicado */}
      <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm text-brand-700">
        <Stethoscope className="h-4 w-4" />
        Exibindo:{" "}
        <span className="font-semibold">
          {selectedEsp === "todas" ? "Todas as especialidades" : selectedEsp}
        </span>
        {souProfissional && myName && (
          <span className="text-brand-600">· seus atendimentos</span>
        )}
      </div>

      {/* Filtros — GET form (Server Component, sem JS no cliente) */}
      <Card className="mb-6 p-5">
        <form method="get">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Input
              name="registro"
              label="Registro Atendimento"
              placeholder="Digite o registro"
              defaultValue={sp.registro ?? ""}
            />
            <Input
              name="paciente"
              label="Paciente"
              placeholder="Digite o nome do paciente"
              defaultValue={sp.paciente ?? ""}
            />
            <Input
              name="data"
              label="Data de Atendimento"
              type="date"
              defaultValue={sp.data ?? ""}
            />
            <Select
              name="especialidade"
              label="Especialidade"
              defaultValue={selectedEsp}
            >
              <option value="todas">Todas</option>
              {espOptions.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            {temFiltro && (
              <Link
                href="/prontuario"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-medium text-ink transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1"
              >
                <X className="h-4 w-4" />
                Limpar
              </Link>
            )}
            <Button type="submit">
              <Search className="h-4 w-4" />
              Filtrar
            </Button>
          </div>
        </form>
      </Card>

      {/* KPIs */}
      <Stagger className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <FadeInUp>
          <StatCard icon={<FileText className="h-5 w-5" />} value={String(todos)} label="Todos" tone="neutral" />
        </FadeInUp>
        <FadeInUp>
          <StatCard icon={<CalendarClock className="h-5 w-5" />} value={String(agendados)} label="Agendados" tone="info" />
        </FadeInUp>
        <FadeInUp>
          <StatCard icon={<Clock className="h-5 w-5" />} value={String(aguardando)} label="Aguardando Atendimento" tone="info" />
        </FadeInUp>
        <FadeInUp>
          <StatCard icon={<Activity className="h-5 w-5" />} value={String(emAtendimento)} label="Em Atendimento" tone="info" />
        </FadeInUp>
        <FadeInUp>
          <StatCard icon={<CheckCircle2 className="h-5 w-5" />} value={String(realizados)} label="Atendimentos Realizados" tone="success" />
        </FadeInUp>
      </Stagger>

      {/* Lista de pacientes em atendimento (mesmo modal de Chamar/Atender/Visualizar/Evasão) */}
      <h3 className="mb-1 font-semibold text-ink">
        Lista de Pacientes <span className="text-muted">({todos} registros)</span>
      </h3>
      {todos === 0 ? (
        <Card className="flex flex-col items-center justify-center px-5 py-16 text-center">
          <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted-surface text-muted">
            <FileText className="h-7 w-7" />
          </span>
          <p className="font-medium text-ink">
            {temFiltro
              ? "Nenhum paciente para os filtros aplicados"
              : "Nenhum paciente em atendimento"}
          </p>
          <p className="mt-1 max-w-md text-sm text-muted">
            {temFiltro
              ? "Ajuste ou limpe os filtros para ver mais resultados."
              : "Pacientes encaminhados para a sua especialidade aparecerão aqui."}
          </p>
        </Card>
      ) : (
        <FilaClient fila={filtrada} isMedico={isMedico} totemEnabled={totemEnabled} />
      )}
    </>
  );
}
