"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  User,
  Stethoscope,
  CalendarDays,
  Clock,
  MapPin,
  Info,
  ChevronLeft,
  ChevronRight,
  Check,
  CircleCheckBig,
  Printer,
  MessageSquare,
  Mail,
} from "lucide-react";
import { qrToSvg } from "@/lib/integrations/qrcode";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { type Paciente } from "@/lib/data/patients";
import { type Profissional } from "@/lib/data/professionals";
import {
  createAppointment,
  listSlots,
  enviarComprovante,
  type Slot,
} from "@/lib/actions/appointments";

const TIPOS = ["Consulta", "Retorno", "Exame", "Procedimento"];
const CONSULTORIO = "Consultório 03 — 2º andar";

type Passo = 1 | 2 | 3 | 4;

export function NovoAgendamentoModal({
  open,
  onClose,
  pacientes,
  profissionais,
}: {
  open: boolean;
  onClose: () => void;
  pacientes: Paciente[];
  profissionais: Profissional[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [slotPending, startSlots] = useTransition();
  const [enviando, startEnvio] = useTransition();

  const [passo, setPasso] = useState<Passo>(1);
  const [busca, setBusca] = useState("");
  const [pacienteId, setPacienteId] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [profissionalId, setProfissionalId] = useState("");
  const [tipo, setTipo] = useState(TIPOS[0]);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [hora, setHora] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [protocolo, setProtocolo] = useState("");

  // QR Code REAL do comprovante (gerado do protocolo, sem rede). Vazio até
  // haver protocolo válido (passo 4).
  const qrSvg = useMemo(
    () => (protocolo && protocolo !== "—" ? qrToSvg(protocolo, 128) : ""),
    [protocolo],
  );

  const especialidades = useMemo(
    () =>
      Array.from(
        new Set(
          profissionais
            .map((p) => p.especialidade)
            .filter((e) => e && e !== "—"),
        ),
      ),
    [profissionais],
  );

  const profFiltrados = useMemo(
    () =>
      especialidade
        ? profissionais.filter((p) => p.especialidade === especialidade)
        : profissionais,
    [profissionais, especialidade],
  );

  const pacientesFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return pacientes.slice(0, 6);
    return pacientes
      .filter(
        (p) =>
          p.nome.toLowerCase().includes(q) ||
          p.cpf.replace(/\D/g, "").includes(q.replace(/\D/g, "")),
      )
      .slice(0, 6);
  }, [pacientes, busca]);

  const paciente = pacientes.find((p) => p.id === pacienteId) ?? null;
  const profissional = profissionais.find((p) => p.id === profissionalId) ?? null;

  function reset() {
    setPasso(1);
    setBusca("");
    setPacienteId("");
    setEspecialidade("");
    setProfissionalId("");
    setTipo(TIPOS[0]);
    setData(new Date().toISOString().slice(0, 10));
    setHora("");
    setSlots([]);
    setProtocolo("");
  }

  function fechar() {
    reset();
    onClose();
  }

  function irParaHorarios() {
    if (!pacienteId) return toast.error("Selecione o paciente.");
    if (!profissionalId) return toast.error("Selecione o profissional.");
    if (!data) return toast.error("Informe a data do atendimento.");
    setHora("");
    startSlots(async () => {
      const result = await listSlots(profissionalId, data);
      setSlots(result);
      setPasso(2);
    });
  }

  function confirmar() {
    startTransition(async () => {
      const res = await createAppointment({
        patient_id: pacienteId,
        professional_id: profissionalId,
        specialty: especialidade,
        service_type: tipo,
        date: data,
        time: hora,
      });
      if (res?.ok) {
        setProtocolo(res.protocol ?? "—");
        toast.success("Agendamento confirmado!");
        router.refresh();
        setPasso(4);
      } else {
        toast.error(res?.error ?? "Não foi possível confirmar o agendamento.");
      }
    });
  }

  /**
   * Envia o comprovante (SMS/e-mail) como STUB local: registra a intenção de
   * envio em appointment_notifications (marca sent_at). Não chama gateway real.
   */
  function enviar(channel: "sms" | "email") {
    if (!protocolo || protocolo === "—") {
      toast.error("Confirme o agendamento antes de enviar o comprovante.");
      return;
    }
    startEnvio(async () => {
      const res = await enviarComprovante({
        channel,
        protocol: protocolo,
        patient_id: pacienteId,
        to: channel === "sms" ? paciente?.telefone ?? "" : paciente?.email ?? "",
      });
      if (res?.ok) {
        toast.success(
          channel === "sms"
            ? "Comprovante registrado para envio por SMS."
            : "Comprovante registrado para envio por e-mail.",
        );
      } else {
        toast.error(res?.error ?? "Não foi possível registrar o envio.");
      }
    });
  }

  const dataFmt = data
    ? new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
    : "—";

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Novo Agendamento"
      subtitle={`Passo ${passo} de 4`}
      className="max-w-2xl"
      footer={rodape()}
    >
      <Passos atual={passo} />

      {passo === 1 && (
        <div className="space-y-4">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Buscar Paciente
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                placeholder="Nome ou CPF..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {pacientesFiltrados.length === 0 ? (
                <li className="rounded-lg bg-muted-surface px-3 py-2 text-sm text-muted">
                  Nenhum paciente encontrado.
                </li>
              ) : (
                pacientesFiltrados.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setPacienteId(p.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        pacienteId === p.id
                          ? "border-brand-400 bg-brand-50 text-brand-700"
                          : "border-line bg-white text-ink hover:bg-muted-surface"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted" />
                        {p.nome}
                      </span>
                      <span className="text-xs text-muted">{p.cpf || "—"}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Especialidade"
              value={especialidade}
              onChange={(e) => {
                setEspecialidade(e.target.value);
                setProfissionalId("");
              }}
            >
              <option value="">Todas as especialidades</option>
              {especialidades.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </Select>
            <Select
              label="Profissional"
              value={profissionalId}
              onChange={(e) => setProfissionalId(e.target.value)}
            >
              <option value="">Selecione o profissional</option>
              {profFiltrados.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
            <Select
              label="Tipo de Atendimento"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              {TIPOS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
            <Input
              label="Data do Atendimento"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
        </div>
      )}

      {passo === 2 && (
        <div>
          <p className="mb-3 flex items-center gap-1.5 text-sm text-muted">
            <CalendarDays className="h-4 w-4" />
            {dataFmt} · {profissional?.nome ?? "—"}
          </p>
          {slotPending ? (
            <p className="py-10 text-center text-sm text-muted">
              Carregando horários...
            </p>
          ) : slots.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-10 text-center">
              <Clock className="h-8 w-8 text-muted" />
              <p className="mt-3 text-sm text-muted">
                Nenhum horário disponível para esta data.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((s) => {
                const sel = hora === s.hora;
                return (
                  <button
                    key={s.hora}
                    type="button"
                    disabled={s.ocupado}
                    onClick={() => setHora(s.hora)}
                    className={`h-10 rounded-lg border text-sm font-medium transition-colors ${
                      s.ocupado
                        ? "cursor-not-allowed border-line bg-muted-surface text-muted"
                        : sel
                          ? "border-brand-500 bg-brand-500 text-white"
                          : "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                    }`}
                  >
                    {s.hora}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-4 flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-green-300 bg-green-50" />
              Disponível
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-line bg-muted-surface" />
              Ocupado
            </span>
          </div>
        </div>
      )}

      {passo === 3 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line">
            <ResumoLinha
              icon={<User className="h-4 w-4" />}
              label="Paciente"
              valor={paciente?.nome ?? "—"}
            />
            <ResumoLinha
              icon={<Stethoscope className="h-4 w-4" />}
              label="Profissional"
              valor={`${profissional?.nome ?? "—"}${
                especialidade ? ` · ${especialidade}` : ""
              }`}
            />
            <ResumoLinha
              icon={<CalendarDays className="h-4 w-4" />}
              label="Data e Hora"
              valor={`${dataFmt} às ${hora}`}
            />
            <ResumoLinha
              icon={<MapPin className="h-4 w-4" />}
              label="Consultório"
              valor={CONSULTORIO}
              last
            />
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-blue-700">
              <Info className="h-4 w-4" />
              Orientações Importantes
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-blue-700">
              <li>Chegue com 15 minutos de antecedência.</li>
              <li>Traga documento com foto e carteira do convênio.</li>
              <li>Em caso de imprevisto, remarque com no mínimo 24h.</li>
            </ul>
          </div>
        </div>
      )}

      {passo === 4 && (
        <div className="flex flex-col items-center text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
            <CircleCheckBig className="h-8 w-8" />
          </span>
          <h3 className="mt-3 text-lg font-semibold text-ink">
            Agendamento Confirmado!
          </h3>
          <p className="mt-1 text-sm text-muted">Protocolo</p>
          <p className="text-xl font-bold tracking-wide text-brand-600">
            {protocolo}
          </p>

          <span
            className="mt-5 inline-flex h-32 w-32 items-center justify-center rounded-xl border border-line bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
            aria-label="QR Code do comprovante de agendamento"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-2 text-xs text-muted">
            Apresente este QR Code na recepção
          </p>

          <div className="mt-5 grid w-full grid-cols-3 gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => enviar("sms")}
              disabled={enviando}
            >
              <MessageSquare className="h-4 w-4" />
              Enviar SMS
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => enviar("email")}
              disabled={enviando}
            >
              <Mail className="h-4 w-4" />
              Enviar E-mail
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );

  function rodape() {
    if (passo === 4) {
      return (
        <Button variant="primary" onClick={fechar}>
          Concluir
        </Button>
      );
    }
    return (
      <>
        {passo > 1 ? (
          <Button
            variant="outline"
            onClick={() => setPasso((p) => (p - 1) as Passo)}
            className="mr-auto"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar
          </Button>
        ) : (
          <Button variant="ghost" onClick={fechar} className="mr-auto">
            Cancelar
          </Button>
        )}

        {passo === 1 && (
          <Button variant="primary" onClick={irParaHorarios} disabled={slotPending}>
            Próximo
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
        {passo === 2 && (
          <Button
            variant="primary"
            onClick={() => (hora ? setPasso(3) : toast.error("Selecione um horário."))}
          >
            Próximo
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
        {passo === 3 && (
          <Button variant="primary" onClick={confirmar} disabled={pending}>
            <Check className="h-4 w-4" />
            {pending ? "Confirmando..." : "Confirmar Agendamento"}
          </Button>
        )}
      </>
    );
  }
}

function Passos({ atual }: { atual: Passo }) {
  const titulos = ["Dados", "Horário", "Confirmação", "Comprovante"];
  return (
    <div className="mb-5 flex items-center gap-2">
      {titulos.map((t, i) => {
        const n = (i + 1) as Passo;
        const done = atual > n;
        const active = atual === n;
        return (
          <div key={t} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold ${
                active
                  ? "bg-brand-500 text-white"
                  : done
                    ? "bg-green-100 text-green-700"
                    : "bg-muted-surface text-muted"
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : n}
            </span>
            {i < titulos.length - 1 && (
              <span
                className={`h-0.5 flex-1 rounded ${
                  done ? "bg-green-300" : "bg-line"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ResumoLinha({
  icon,
  label,
  valor,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  valor: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 px-4 py-3 ${
        last ? "" : "border-b border-line"
      }`}
    >
      <span className="flex items-center gap-2 text-sm text-muted">
        {icon}
        {label}
      </span>
      <span className="text-right text-sm font-medium text-ink">{valor}</span>
    </div>
  );
}
