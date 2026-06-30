"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Stethoscope,
  User,
  CreditCard,
  PhoneCall,
  Search,
  Filter,
  CalendarClock,
  CalendarDays,
  ArrowDownUp,
  Ticket,
  Users,
  Hash,
  ArrowRight,
} from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { type FilaItem } from "@/lib/data/queue";
import {
  DEFAULT_STAGES,
  type FlowStage,
} from "@/lib/data/attendance-flow.shared";
import type { AttendanceOptionsByCategory } from "@/lib/data/attendance-options";
import {
  fallbackTriageTemplate,
  type TriageTemplate,
} from "@/lib/data/triage-templates.shared";
import { chaveEspecialidade } from "@/lib/clinico/anamnese-config";
import { AcoesPacienteModal } from "./AcoesPacienteModal";
import { TriagemModal } from "./TriagemModal";
import { DadosAtendimentoModal } from "./DadosAtendimentoModal";
import { DesistenciaModal } from "./DesistenciaModal";
import { CheckInModal } from "./CheckInModal";

type ModalKind = "acoes" | "triagem" | "atendimento" | "desistencia" | null;

/** Critérios de ordenação da fila. */
type Ordenacao = "agendamento" | "az" | "za";

const ORDENACAO_OPCOES: { value: Ordenacao; label: string }[] = [
  { value: "agendamento", label: "Horário de agendamento" },
  { value: "az", label: "Nome (A–Z)" },
  { value: "za", label: "Nome (Z–A)" },
];

/**
 * Comparador conforme o critério escolhido. "agendamento" ordena pelo horário
 * (HH:MM, crescente); itens sem horário ("—") vão para o fim.
 */
function compararFila(a: FilaItem, b: FilaItem, ord: Ordenacao): number {
  if (ord === "az") return a.paciente.localeCompare(b.paciente, "pt-BR");
  if (ord === "za") return b.paciente.localeCompare(a.paciente, "pt-BR");
  const ha = a.hora === "—" ? "99:99" : a.hora;
  const hb = b.hora === "—" ? "99:99" : b.hora;
  return ha.localeCompare(hb);
}

/**
 * Etapa atual + próximo passo derivados do status do item (sem ir ao backend).
 * Visão curta para a recepção: recepção → triagem → atendimento → conclusão.
 */
function fluxoDoStatus(
  statusRaw: string,
): { etapa: string; proximo: string | null } | null {
  switch (statusRaw) {
    case "na_recepcao":
      return { etapa: "Na recepção", proximo: "Triagem" };
    case "triagem":
      return { etapa: "Na triagem", proximo: "Atendimento" };
    case "aguardando":
    case "aguardando_atendimento":
      return { etapa: "Aguardando", proximo: "Atendimento" };
    case "chamado":
      return { etapa: "Chamado", proximo: "Atendimento" };
    case "em_atendimento":
      return { etapa: "Em atendimento", proximo: "Conclusão" };
    case "finalizado":
      return { etapa: "Finalizado", proximo: null };
    case "desistencia":
      return { etapa: "Desistência", proximo: null };
    default:
      return null;
  }
}

/** Opções do filtro de status (valor = statusRaw do banco). */
const STATUS_OPCOES = [
  { value: "todos", label: "Todos os Status" },
  { value: "aguardando", label: "Aguardando" },
  { value: "na_recepcao", label: "Na recepção" },
  { value: "aguardando_atendimento", label: "Aguardando atendimento" },
  { value: "triagem", label: "Em Triagem" },
  { value: "chamado", label: "Chamado" },
  { value: "em_atendimento", label: "Em Atendimento" },
  { value: "finalizado", label: "Finalizado" },
  { value: "desistencia", label: "Desistência" },
];

export function FilaClient({
  fila,
  agendados = [],
  stages = DEFAULT_STAGES,
  attendanceOptions,
  triageTemplates = [],
  kpis,
  dataSelecionada,
  isHoje = true,
  todoPeriodo = false,
  isMedico = false,
}: {
  fila: FilaItem[];
  agendados?: FilaItem[];
  stages?: FlowStage[];
  attendanceOptions?: AttendanceOptionsByCategory;
  /** Modelos de triagem por especialidade (gestor pode customizar). */
  triageTemplates?: TriageTemplate[];
  kpis?: {
    aguardando: number;
    chamados: number;
    emAtendimento: number;
    total: number;
  };
  /** Dia exibido (yyyy-mm-dd). A fila já vem filtrada por este dia no servidor. */
  dataSelecionada?: string;
  /** true quando o dia exibido é hoje (mostra agendados aguardando chegada). */
  isHoje?: boolean;
  /** true quando o filtro de data está desligado (fila do período inteiro). */
  todoPeriodo?: boolean;
  /** true quando o usuário é médico → "Atender" leva ao prontuário do paciente. */
  isMedico?: boolean;
}) {
  const router = useRouter();
  const [navegando, startNavegacao] = useTransition();

  const [selected, setSelected] = useState<FilaItem | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);

  // Modelo de triagem do paciente selecionado: casa a especialidade do item com
  // os templates da clínica (chave normalizada). Sem match → "Geral" ou fallback.
  const triageTemplate = useMemo<TriageTemplate>(() => {
    const especialidade = selected?.especialidade ?? null;
    const chave = chaveEspecialidade(especialidade);
    const match = triageTemplates.find(
      (t) => chaveEspecialidade(t.specialty) === chave,
    );
    return (
      match ??
      triageTemplates.find((t) => t.specialty === "Geral") ??
      triageTemplates[0] ??
      fallbackTriageTemplate(especialidade ?? "Geral")
    );
  }, [selected, triageTemplates]);

  // Check-in (totem/recepção)
  const [checkInAlvo, setCheckInAlvo] = useState<FilaItem | null>(null);
  const [checkInOpen, setCheckInOpen] = useState(false);

  // Busca + filtro + ordenação
  const [query, setQuery] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("agendamento");

  // Clicar numa KPI filtra a fila pelo status; clicar na ativa (ou na Total)
  // volta para "todos". Compartilha o MESMO estado do Select de status.
  const toggleStatus = (valor: string) =>
    setStatusFiltro((atual) => (atual === valor ? "todos" : valor));

  const termo = query.trim().toLowerCase();

  const filaFiltrada = useMemo(() => {
    return fila
      .filter((item) => {
        const casaTexto =
          termo === "" ||
          item.paciente.toLowerCase().includes(termo) ||
          item.codigo.toLowerCase().includes(termo);
        const casaStatus =
          statusFiltro === "todos" || item.statusRaw === statusFiltro;
        return casaTexto && casaStatus;
      })
      .sort((a, b) => compararFila(a, b, ordenacao));
  }, [fila, termo, statusFiltro, ordenacao]);

  // Agendados só aparecem quando o filtro está em "todos" (não têm status de fila);
  // a busca textual continua valendo.
  const agendadosFiltrados = useMemo(() => {
    if (statusFiltro !== "todos") return [];
    return agendados
      .filter(
        (item) => termo === "" || item.paciente.toLowerCase().includes(termo),
      )
      .sort((a, b) => compararFila(a, b, ordenacao));
  }, [agendados, termo, statusFiltro, ordenacao]);

  // Troca o dia exibido navegando pela URL (?data=…). A page re-consulta a fila
  // no servidor já filtrada pelo dia → não carrega pacientes de dias passados.
  // Data vazia ou igual a hoje limpa o param (URL limpa, default = hoje).
  function mudarData(novaData: string) {
    const params = new URLSearchParams();
    if (novaData) params.set("data", novaData);
    const qs = params.toString();
    startNavegacao(() => router.push(qs ? `/fila?${qs}` : "/fila"));
  }

  function abrir(item: FilaItem) {
    setSelected(item);
    setModal("acoes");
  }

  function fechar() {
    setModal(null);
    setSelected(null);
  }

  function abrirCheckIn(item: FilaItem) {
    setCheckInAlvo(item);
    setCheckInOpen(true);
  }

  function fecharCheckIn() {
    setCheckInOpen(false);
    setCheckInAlvo(null);
  }

  function onStatusChange(statusRaw: string) {
    setSelected((s) => (s ? { ...s, statusRaw } : s));
  }

  return (
    <>
      {kpis && (
        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FadeInUp>
            <StatCard
              icon={<Clock className="h-5 w-5" />}
              value={String(kpis.aguardando)}
              label="Aguardando"
              tone="info"
              onClick={() => toggleStatus("aguardando")}
              active={statusFiltro === "aguardando"}
            />
          </FadeInUp>
          <FadeInUp>
            <StatCard
              icon={<PhoneCall className="h-5 w-5" />}
              value={String(kpis.chamados)}
              label="Chamados"
              tone="info"
              onClick={() => toggleStatus("chamado")}
              active={statusFiltro === "chamado"}
            />
          </FadeInUp>
          <FadeInUp>
            <StatCard
              icon={<Users className="h-5 w-5" />}
              value={String(kpis.emAtendimento)}
              label="Em Atendimento"
              tone="info"
              onClick={() => toggleStatus("em_atendimento")}
              active={statusFiltro === "em_atendimento"}
            />
          </FadeInUp>
          <FadeInUp>
            <StatCard
              icon={<Users className="h-5 w-5" />}
              value={String(kpis.total)}
              label="Total"
              tone="neutral"
              onClick={() => setStatusFiltro("todos")}
              active={statusFiltro === "todos"}
            />
          </FadeInUp>
        </Stagger>
      )}

      {/* Agendados (aguardando chegada) */}
      {agendadosFiltrados.length > 0 && (
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-muted" />
            <h2 className="font-semibold text-ink">
              Agendados — aguardando chegada
            </h2>
            <span className="rounded-full bg-muted-surface px-2 py-0.5 text-xs font-medium text-muted">
              {agendadosFiltrados.length}
            </span>
          </div>

          <Stagger className="flex flex-col gap-3">
            {agendadosFiltrados.map((item) => (
              <FadeInUp key={item.id}>
                <Card className="border-dashed p-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-muted-surface text-muted">
                      <CalendarClock className="h-5 w-5" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-ink">
                          {item.paciente}
                        </h3>
                        {item.tags?.map((tag) => (
                          <Badge key={tag.label} status={tag.status}>
                            {tag.label}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted">
                        <span className="flex items-center gap-1.5">
                          <CalendarClock className="h-4 w-4" /> Agendado:{" "}
                          {item.agendamentoEm ?? item.hora}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4" /> Entrada:{" "}
                          {item.entradaEm ?? "—"}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Stethoscope className="h-4 w-4" />{" "}
                          {item.especialidade}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <User className="h-4 w-4" /> {item.medico}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <CreditCard className="h-4 w-4" /> {item.convenio}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => abrirCheckIn(item)}
                      className="flex h-10 flex-none items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1"
                    >
                      <Ticket className="h-4 w-4" />
                      Check-in / Emitir Senha
                    </button>
                  </div>
                </Card>
              </FadeInUp>
            ))}
          </Stagger>
        </section>
      )}

      {/* Busca + filtro (funcionais) */}
      <Card className="mt-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              type="search"
              aria-label="Buscar paciente por nome ou senha"
              placeholder="Buscar por nome ou senha..."
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {/* Filtro por data: a fila mostra só o dia selecionado (default = hoje). */}
          <div className="relative sm:w-48">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              type="date"
              aria-label="Filtrar a fila por data"
              className="pl-9"
              value={dataSelecionada ?? ""}
              disabled={navegando || todoPeriodo}
              onChange={(e) => mudarData(e.target.value)}
            />
          </div>
          {/* Todo o período: desliga o filtro de data e lista a fila inteira. */}
          <button
            type="button"
            onClick={() => mudarData(todoPeriodo ? "" : "todos")}
            disabled={navegando}
            aria-pressed={todoPeriodo}
            className={`h-10 flex-none rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-60 ${
              todoPeriodo
                ? "border-brand-500 bg-brand-50 text-brand-600"
                : "border-line text-muted hover:bg-muted-surface hover:text-ink"
            }`}
          >
            Todo o período
          </button>
          {!isHoje && !todoPeriodo && (
            <button
              type="button"
              onClick={() => mudarData("")}
              disabled={navegando}
              className="h-10 flex-none rounded-lg border border-line px-3 text-sm font-medium text-muted transition-colors hover:bg-muted-surface hover:text-ink disabled:opacity-60"
            >
              Hoje
            </button>
          )}
          <div className="relative sm:w-56">
            <Filter className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
            <Select
              aria-label="Filtrar por status"
              className="pl-9"
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value)}
            >
              {STATUS_OPCOES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          {/* Ordenação: por horário de agendamento ou ordem alfabética. */}
          <div className="relative sm:w-56">
            <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
            <Select
              aria-label="Ordenar a fila"
              className="pl-9"
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
            >
              {ORDENACAO_OPCOES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* Fila ativa */}
      {filaFiltrada.length === 0 ? (
        <Card className="mt-4 p-10 text-center">
          <p className="text-sm text-muted">
            Nenhum paciente encontrado para os filtros aplicados.
          </p>
        </Card>
      ) : (
        <Stagger className="mt-4 flex flex-col gap-3">
          {filaFiltrada.map((item) => (
            <FadeInUp key={item.id}>
              <Card
                interactive
                role="button"
                tabIndex={0}
                onClick={() => abrir(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    abrir(item);
                  }
                }}
                className="cursor-pointer p-4"
              >
                <div className="flex items-center gap-4">
                  <span className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-white">
                    {item.codigo}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-ink">
                        {item.paciente}
                      </h3>
                      {item.atendimentoCodigo && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted-surface px-2 py-0.5 text-xs font-medium text-muted">
                          <Hash className="h-3 w-3" />
                          {`#${item.atendimentoCodigo}`}
                        </span>
                      )}
                      {item.tags?.map((tag) => (
                        <Badge key={tag.label} status={tag.status}>
                          {tag.label}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted">
                      <span className="flex items-center gap-1.5">
                        <CalendarClock className="h-4 w-4" /> Agendado:{" "}
                        {item.agendamentoEm ?? item.hora}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" /> Entrada: {item.entradaEm ?? "—"}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Stethoscope className="h-4 w-4" /> {item.especialidade}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <User className="h-4 w-4" /> {item.medico}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <CreditCard className="h-4 w-4" /> {item.convenio}
                      </span>
                    </div>
                    {(() => {
                      const fluxo = fluxoDoStatus(item.statusRaw);
                      if (!fluxo) return null;
                      return (
                        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600">
                          {fluxo.etapa}
                          {fluxo.proximo && (
                            <>
                              <ArrowRight className="h-3 w-3" />
                              <span className="text-muted">
                                próximo: {fluxo.proximo}
                              </span>
                            </>
                          )}
                        </span>
                      );
                    })()}
                  </div>

                  <Badge status={item.status.tone} className="flex-none">
                    {item.status.tone === "active" ? (
                      <PhoneCall className="h-3 w-3" />
                    ) : (
                      <Clock className="h-3 w-3" />
                    )}
                    {item.status.label}
                  </Badge>
                </div>
              </Card>
            </FadeInUp>
          ))}
        </Stagger>
      )}

      {selected && (
        <>
          <AcoesPacienteModal
            item={selected}
            stages={stages}
            open={modal === "acoes"}
            onClose={fechar}
            onStatusChange={onStatusChange}
            onTriar={() => setModal("triagem")}
            onAtender={() => setModal("atendimento")}
            onDesistir={() => setModal("desistencia")}
            isMedico={isMedico}
          />
          <TriagemModal
            item={selected}
            template={triageTemplate}
            open={modal === "triagem"}
            onClose={fechar}
            onStatusChange={onStatusChange}
          />
          <DadosAtendimentoModal
            item={selected}
            open={modal === "atendimento"}
            onClose={fechar}
            onVoltar={() => setModal("acoes")}
            options={attendanceOptions}
          />
          <DesistenciaModal
            item={selected}
            open={modal === "desistencia"}
            onClose={fechar}
            onStatusChange={onStatusChange}
          />
        </>
      )}

      {checkInOpen && checkInAlvo && (
        <CheckInModal
          key={checkInAlvo.id}
          agendado={checkInAlvo}
          open={checkInOpen}
          onClose={fecharCheckIn}
        />
      )}
    </>
  );
}
