"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CalendarSearch,
  User,
  Stethoscope,
  UserPlus,
  Clock,
  CheckCircle2,
  Activity,
  CheckCheck,
} from "lucide-react";
import { toast } from "sonner";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import {
  type Atendimento,
  type AppointmentStatus,
} from "@/lib/data/appointments";
import { type Profissional } from "@/lib/data/professionals";
import { trocarProfissional } from "@/lib/actions/appointments";
import { AgendaItemActions } from "./AgendaItemActions";

/** Opções de status do filtro (rótulos pt-BR alinhados ao data layer). */
const STATUS_OPCOES: { value: AppointmentStatus; label: string }[] = [
  { value: "agendado", label: "Agendado" },
  { value: "confirmado", label: "Confirmado" },
  { value: "em_atendimento", label: "Em Atendimento" },
  { value: "concluido", label: "Finalizado" },
  { value: "cancelado", label: "Cancelado" },
  { value: "faltou", label: "Faltou" },
];

/**
 * Lista de atendimentos com filtros funcionais (nome/CPF, data, profissional,
 * status) e ações de manutenção por linha. Dados vêm do servidor por props.
 */
export function AgendaList({
  atendimentos,
  profissionais,
  kpis,
}: {
  atendimentos: Atendimento[];
  profissionais: Profissional[];
  kpis: {
    total: number;
    agendados: number;
    confirmados: number;
    emAtendimento: number;
    finalizados: number;
  };
}) {
  const [busca, setBusca] = useState("");
  const [data, setData] = useState("");
  const [profissional, setProfissional] = useState("");
  const [status, setStatus] = useState("");

  // Clicar numa KPI filtra a tabela pelo status; clicar na ativa (ou na Total)
  // limpa o filtro. Compartilha o MESMO estado do Select de status.
  const toggleStatus = (valor: string) =>
    setStatus((atual) => (atual === valor ? "" : valor));

  // Profissionais que aparecem na agenda (nomes presentes nos atendimentos).
  const profissionaisOpcoes = useMemo(() => {
    const nomes = Array.from(
      new Set(atendimentos.map((a) => a.profissional).filter((n) => n && n !== "—")),
    );
    return nomes.sort((a, b) => a.localeCompare(b));
  }, [atendimentos]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return atendimentos.filter((a) => {
      if (q) {
        const matchNome = a.paciente.toLowerCase().includes(q);
        const matchCpf = qDigits.length > 0 && a.cpf.includes(qDigits);
        if (!matchNome && !matchCpf) return false;
      }
      if (data && a.dataISO !== data) return false;
      if (profissional && a.profissional !== profissional) return false;
      if (status && a.status !== status) return false;
      return true;
    });
  }, [atendimentos, busca, data, profissional, status]);

  return (
    <>
      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <FadeInUp>
          <StatCard
            icon={<CalendarDays className="h-5 w-5" />}
            value={kpis.total}
            label="Total de Agendamentos"
            tone="neutral"
            onClick={() => setStatus("")}
            active={status === ""}
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            value={kpis.agendados}
            label="Agendados"
            tone="info"
            onClick={() => toggleStatus("agendado")}
            active={status === "agendado"}
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            value={kpis.confirmados}
            label="Confirmados"
            tone="success"
            onClick={() => toggleStatus("confirmado")}
            active={status === "confirmado"}
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Activity className="h-5 w-5" />}
            value={kpis.emAtendimento}
            label="Em Atendimento"
            tone="info"
            onClick={() => toggleStatus("em_atendimento")}
            active={status === "em_atendimento"}
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<CheckCheck className="h-5 w-5" />}
            value={kpis.finalizados}
            label="Finalizados"
            tone="success"
            onClick={() => toggleStatus("concluido")}
            active={status === "concluido"}
          />
        </FadeInUp>
      </Stagger>

      <Card className="mt-6 p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Buscar Paciente"
            placeholder="Nome ou CPF..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <Input
            label="Data do Atendimento"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
          <Select
            label="Profissional"
            value={profissional}
            onChange={(e) => setProfissional(e.target.value)}
          >
            <option value="">Todos os profissionais</option>
            {profissionaisOpcoes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos os status</option>
            {STATUS_OPCOES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Stagger className="mt-6">
        <FadeInUp>
          <Card className="overflow-hidden">
            <div className="p-5">
              <h3 className="font-semibold text-ink">
                Lista de Atendimentos{" "}
                <span className="text-muted">
                  ({filtrados.length} agendamento
                  {filtrados.length === 1 ? "" : "s"})
                </span>
              </h3>
            </div>

            {filtrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
                  <CalendarSearch className="h-8 w-8" />
                </span>
                <h4 className="mt-4 text-lg font-semibold text-ink">
                  Nenhum agendamento encontrado
                </h4>
                <p className="mt-1 text-sm text-muted">
                  Tente ajustar os filtros ou criar um novo agendamento
                </p>
                <span className="mt-5 inline-flex items-center rounded-full border border-line bg-canvas px-4 py-1.5 text-xs text-muted">
                  Use os filtros acima para buscar agendamentos
                </span>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {filtrados.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-4">
                      <span className="inline-flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-center text-brand-600">
                        <span className="text-sm font-bold leading-none">
                          {a.hora}
                        </span>
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium text-ink">
                          <User className="h-4 w-4 text-muted" />
                          {a.paciente}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                          <Stethoscope className="h-3.5 w-3.5" />
                          {a.profissional} · {a.especialidade}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {a.data} — {a.motivo}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-center">
                      {!a.profissionalId && (
                        <Badge status="warn">A definir</Badge>
                      )}
                      <Badge status={a.badge}>{a.statusLabel}</Badge>
                      {!a.profissionalId && (
                        <AtribuirProfissional
                          atendimento={a}
                          profissionais={profissionais}
                        />
                      )}
                      <AgendaItemActions
                        atendimento={a}
                        profissionais={profissionais}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </FadeInUp>
      </Stagger>
    </>
  );
}

/**
 * Atribui um profissional a um agendamento criado por especialidade
 * (sem profissional). Reaproveita a Server Action `trocarProfissional`.
 * A lista de profissionais é filtrada pela especialidade do agendamento
 * (quando conhecida; caso contrário oferece todos).
 */
function AtribuirProfissional({
  atendimento,
  profissionais,
}: {
  atendimento: Atendimento;
  profissionais: Profissional[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [profissionalId, setProfissionalId] = useState("");
  const [pending, startTransition] = useTransition();

  const temEspecialidade =
    Boolean(atendimento.especialidade) && atendimento.especialidade !== "—";

  const opcoes = useMemo(() => {
    if (!temEspecialidade) return profissionais;
    const filtrados = profissionais.filter(
      (p) => p.especialidade === atendimento.especialidade,
    );
    return filtrados.length > 0 ? filtrados : profissionais;
  }, [profissionais, atendimento.especialidade, temEspecialidade]);

  const profEscolhido = profissionais.find((p) => p.id === profissionalId) ?? null;

  function confirmar() {
    if (!profissionalId) {
      toast.error("Selecione o profissional.");
      return;
    }
    startTransition(async () => {
      const res = await trocarProfissional({
        id: atendimento.id,
        professional_id: profissionalId,
        specialty: profEscolhido?.especialidade ?? atendimento.especialidade,
      });
      if (res?.ok) {
        toast.success("Profissional atribuído.");
        setAberto(false);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível atribuir o profissional.");
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setAberto(true)}
        title="Atribuir profissional"
      >
        <UserPlus className="h-3.5 w-3.5" />
        Atribuir
      </Button>

      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        title="Atribuir Profissional"
        subtitle={atendimento.paciente}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Fechar
            </Button>
            <Button variant="primary" onClick={confirmar} disabled={pending}>
              <UserPlus className="h-4 w-4" />
              {pending ? "Atribuindo..." : "Atribuir"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Agendamento de{" "}
            <span className="font-medium text-ink">{atendimento.paciente}</span> em{" "}
            <span className="font-medium text-ink">
              {atendimento.data} às {atendimento.hora}
            </span>
            {temEspecialidade ? (
              <>
                {" "}
                ·{" "}
                <span className="font-medium text-ink">
                  {atendimento.especialidade}
                </span>
              </>
            ) : null}
            .
          </p>
          <Select
            label="Profissional"
            value={profissionalId}
            onChange={(e) => setProfissionalId(e.target.value)}
          >
            <option value="">Selecione o profissional</option>
            {opcoes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
                {p.especialidade && p.especialidade !== "—"
                  ? ` · ${p.especialidade}`
                  : ""}
              </option>
            ))}
          </Select>
        </div>
      </Modal>
    </>
  );
}
