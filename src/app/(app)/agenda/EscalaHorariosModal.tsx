"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Sparkles,
  Plus,
  Lock,
  Unlock,
  CalendarRange,
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { type Profissional } from "@/lib/data/professionals";
import { type Escala } from "@/lib/data/schedules";
import { type Procedimento } from "@/lib/data/procedures";
import { EXAMES_TUSS } from "@/lib/clinico/exames-shared";
import {
  createSchedule,
  updateSchedule,
  createBlock,
  removeBlock,
  listBlocks,
} from "@/lib/actions/appointments";

/** Dias da semana (number = getDay: 0=Dom..6=Sáb), exibidos de Seg a Dom. */
const DIAS: { n: number; label: string }[] = [
  { n: 1, label: "Seg" },
  { n: 2, label: "Ter" },
  { n: 3, label: "Qua" },
  { n: 4, label: "Qui" },
  { n: 5, label: "Sex" },
  { n: 6, label: "Sáb" },
  { n: 0, label: "Dom" },
];

const TIPOS = ["Consulta", "Retorno", "Exame", "Procedimento"];

type Aba = "dados" | "horarios";
/** blockId presente => bloqueio persistido em schedule_blocks. */
type SlotEscala = {
  hora: string;
  bloqueado: boolean;
  blockId?: string;
  motivo?: string;
};

/** Gera horários "HH:mm" entre início e fim com passo em minutos. */
function gerarHorarios(start: string, end: string, stepMin: number): string[] {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const out: string[] = [];
  const fim = toMin(end);
  const step = stepMin > 0 ? stepMin : 30;
  for (let cur = toMin(start); cur < fim; cur += step) {
    out.push(
      `${String(Math.floor(cur / 60)).padStart(2, "0")}:${String(cur % 60).padStart(2, "0")}`,
    );
  }
  return out;
}

export function EscalaHorariosModal({
  open,
  onClose,
  profissionais,
  procedimentos,
  escalaParaEditar,
}: {
  open: boolean;
  onClose: () => void;
  profissionais: Profissional[];
  procedimentos: Procedimento[];
  /** Quando presente, o modal abre em modo edição (pré-preenche + updateSchedule). */
  escalaParaEditar?: Escala;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const editMode = Boolean(escalaParaEditar);

  const [aba, setAba] = useState<Aba>("dados");
  const [descricao, setDescricao] = useState("");
  const [profissionalId, setProfissionalId] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [tipo, setTipo] = useState(TIPOS[0]);
  const [slotMin, setSlotMin] = useState(30);
  const [encaixe, setEncaixe] = useState(0);
  const [ativo, setAtivo] = useState(true);
  // Itens atendidos pela escala (conforme o Tipo de Escala).
  const [procedureCodes, setProcedureCodes] = useState<string[]>([]);
  const [examCodes, setExamCodes] = useState<string[]>([]);

  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5]);
  const [inicio, setInicio] = useState("08:00");
  const [fim, setFim] = useState("18:00");
  // Vigência da escala (período de validade).
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [slots, setSlots] = useState<SlotEscala[]>([]);
  const [manual, setManual] = useState("");
  // Data alvo para persistência de bloqueios em schedule_blocks.
  const [dataBloqueio, setDataBloqueio] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [blockPending, startBlock] = useTransition();
  // Diálogo de bloqueio: horário-alvo + motivo (obrigatório) antes de persistir.
  const [bloqueioAlvo, setBloqueioAlvo] = useState<string | null>(null);
  const [motivoBloqueio, setMotivoBloqueio] = useState("");

  // Pré-preenche (modo edição) ou reseta (modo criação) ao abrir.
  useEffect(() => {
    if (!open) return;
    if (escalaParaEditar) {
      const e = escalaParaEditar;
      setAba("dados");
      setDescricao(e.description);
      setProfissionalId(e.professionalId);
      setEspecialidade(e.specialty);
      setTipo(e.serviceType || TIPOS[0]);
      setSlotMin(e.slotMinutes);
      setEncaixe(e.overbookLimit);
      setAtivo(e.active);
      setDias(e.weekdays);
      setInicio(e.startTime);
      setFim(e.endTime);
      setDataInicio(e.startDate ?? "");
      setDataFim(e.endDate ?? "");
      setSlots([]);
      setProcedureCodes(e.procedureCodes ?? []);
      setExamCodes(e.examTussCodes ?? []);
    } else {
      setAba("dados");
      setDescricao("");
      setProfissionalId("");
      setEspecialidade("");
      setTipo(TIPOS[0]);
      setSlotMin(30);
      setEncaixe(0);
      setAtivo(true);
      setDias([1, 2, 3, 4, 5]);
      setInicio("08:00");
      setFim("18:00");
      setDataInicio("");
      setDataFim("");
      setSlots([]);
      setProcedureCodes([]);
      setExamCodes([]);
    }
  }, [open, escalaParaEditar]);

  // Sincroniza os bloqueios persistidos quando há profissional + data + grade.
  useEffect(() => {
    if (!open || !profissionalId || !dataBloqueio || slots.length === 0) return;
    let ativo = true;
    (async () => {
      const blocks = await listBlocks(profissionalId, dataBloqueio);
      if (!ativo) return;
      const porHora = new Map(blocks.map((b) => [b.hora, b]));
      setSlots((cur) =>
        cur.map((s) => {
          const b = porHora.get(s.hora);
          return b
            ? { ...s, bloqueado: true, blockId: b.id, motivo: b.motivo }
            : { ...s, bloqueado: false, blockId: undefined, motivo: undefined };
        }),
      );
    })();
    return () => {
      ativo = false;
    };
    // Recarrega ao mudar profissional/data; slots.length para refletir nova grade.
     
  }, [open, profissionalId, dataBloqueio, slots.length]);

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

  function toggleDia(n: number) {
    setDias((cur) =>
      cur.includes(n) ? cur.filter((d) => d !== n) : [...cur, n],
    );
  }

  /** Marca/desmarca um item (código) num conjunto de seleção (exames/procedimentos). */
  function toggleItem(
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    code: string,
  ) {
    setter((cur) =>
      cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code],
    );
  }

  function gerarGrade() {
    const horas = gerarHorarios(inicio, fim, slotMin);
    if (horas.length === 0) {
      toast.error("Horário final deve ser maior que o inicial.");
      return;
    }
    setSlots(horas.map((hora) => ({ hora, bloqueado: false })));
    toast.success(`${horas.length} horários gerados.`);
  }

  function adicionarManual() {
    if (!/^\d{2}:\d{2}$/.test(manual)) {
      toast.error("Informe um horário válido (HH:mm).");
      return;
    }
    if (slots.some((s) => s.hora === manual)) {
      toast.error("Horário já existe na grade.");
      return;
    }
    setSlots((cur) =>
      [...cur, { hora: manual, bloqueado: false }].sort((a, b) =>
        a.hora.localeCompare(b.hora),
      ),
    );
    setManual("");
  }

  /**
   * Clique num horário. Se já bloqueado → desbloqueia direto. Se livre → abre o
   * diálogo de motivo (não bloqueia no clique: evita bloqueio acidental e exige
   * registrar o porquê). Exige profissional + data (o bloqueio é por data).
   */
  function aoClicarSlot(hora: string) {
    if (!profissionalId) {
      toast.error("Selecione o profissional para bloquear horários.");
      setAba("dados");
      return;
    }
    if (!dataBloqueio) {
      toast.error("Informe a data para o bloqueio.");
      return;
    }
    const slot = slots.find((s) => s.hora === hora);
    if (!slot) return;

    if (slot.bloqueado && slot.blockId) {
      desbloquear(slot.hora, slot.blockId);
      return;
    }
    // Livre → pede o motivo antes de bloquear.
    setMotivoBloqueio("");
    setBloqueioAlvo(hora);
  }

  /** Remove o bloqueio persistido de um horário. */
  function desbloquear(hora: string, blockId: string) {
    startBlock(async () => {
      const res = await removeBlock(blockId);
      if (res?.ok) {
        setSlots((cur) =>
          cur.map((s) =>
            s.hora === hora
              ? { ...s, bloqueado: false, blockId: undefined, motivo: undefined }
              : s,
          ),
        );
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível desbloquear o horário.");
      }
    });
  }

  /** Confirma o bloqueio do horário-alvo com o motivo informado (obrigatório). */
  function confirmarBloqueio() {
    const hora = bloqueioAlvo;
    if (!hora) return;
    const motivo = motivoBloqueio.trim();
    if (motivo.length < 3) {
      toast.error("Descreva o motivo do bloqueio (mínimo 3 caracteres).");
      return;
    }
    startBlock(async () => {
      const res = await createBlock({
        professional_id: profissionalId,
        date: dataBloqueio,
        time: hora,
        reason: motivo,
      });
      if (res?.ok) {
        setSlots((cur) =>
          cur.map((s) =>
            s.hora === hora
              ? { ...s, bloqueado: true, blockId: res.protocol, motivo }
              : s,
          ),
        );
        setBloqueioAlvo(null);
        setMotivoBloqueio("");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível bloquear o horário.");
      }
    });
  }

  function salvar() {
    if (descricao.trim().length < 2) {
      toast.error("Informe a descrição da escala.");
      setAba("dados");
      return;
    }
    if (dias.length === 0) {
      toast.error("Selecione ao menos um dia da semana.");
      setAba("horarios");
      return;
    }
    if (!dataInicio || !dataFim) {
      toast.error("Informe a data inicial e a data final da vigência.");
      setAba("horarios");
      return;
    }
    if (dataFim < dataInicio) {
      toast.error("A data final deve ser igual ou posterior à inicial.");
      setAba("horarios");
      return;
    }
    startTransition(async () => {
      const payload = {
        description: descricao,
        professional_id: profissionalId,
        specialty: especialidade,
        service_type: tipo,
        slot_minutes: slotMin,
        overbook_limit: encaixe,
        weekdays: dias,
        start_time: inicio,
        end_time: fim,
        start_date: dataInicio,
        end_date: dataFim,
        // Só guarda o conjunto do tipo atual; limpa o outro ao trocar de tipo.
        procedure_codes: tipo === "Procedimento" ? procedureCodes : [],
        exam_tuss_codes: tipo === "Exame" ? examCodes : [],
      };
      const res = escalaParaEditar
        ? await updateSchedule(escalaParaEditar.id, { ...payload, active: ativo })
        : await createSchedule(payload);
      if (res?.ok) {
        toast.success(
          escalaParaEditar
            ? "Escala atualizada com sucesso."
            : `Escala ${res.protocol ?? ""} salva com sucesso.`,
        );
        router.refresh();
        onClose();
      } else {
        toast.error(res?.error ?? "Não foi possível salvar a escala.");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        editMode ? "Editar Escala de Horários" : "Configuração de Escala de Horários"
      }
      subtitle="Defina a grade de atendimento de um profissional"
      className="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={salvar} disabled={pending}>
            <Save className="h-4 w-4" />
            {pending
              ? "Salvando..."
              : editMode
                ? "Salvar Alterações"
                : "Salvar Escala"}
          </Button>
        </>
      }
    >
      {/* Abas */}
      <div className="mb-5 flex gap-1 rounded-xl bg-muted-surface p-1">
        <TabButton active={aba === "dados"} onClick={() => setAba("dados")}>
          Dados Principais
        </TabButton>
        <TabButton active={aba === "horarios"} onClick={() => setAba("horarios")}>
          Horários
        </TabButton>
      </div>

      {aba === "dados" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">Código</span>
            <span className="inline-flex h-10 items-center rounded-lg bg-brand-50 px-3 text-sm font-semibold text-brand-600">
              {escalaParaEditar?.code ?? "AUTO"}
            </span>
          </div>
          <Input
            label="Descrição"
            placeholder="Ex.: Manhã - Cardiologia"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
          <Input
            label="Tempo de Atendimento (min)"
            type="number"
            min={5}
            step={5}
            value={slotMin}
            onChange={(e) => setSlotMin(Number(e.target.value))}
          />
          <Input
            label="Limite de Encaixe"
            type="number"
            min={0}
            value={encaixe}
            onChange={(e) => setEncaixe(Number(e.target.value))}
          />
          <Select
            label="Profissional"
            value={profissionalId}
            onChange={(e) => setProfissionalId(e.target.value)}
          >
            <option value="">Todos os profissionais</option>
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
          <Select
            label="Especialidade"
            value={especialidade}
            onChange={(e) => setEspecialidade(e.target.value)}
          >
            <option value="">Todas</option>
            {especialidades.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </Select>
          <Select
            label="Tipo de Escala"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            {TIPOS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>

          {/* Itens da escala: aparece conforme o Tipo de Escala. */}
          {tipo === "Procedimento" && (
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Procedimentos atendidos
              </span>
              {procedimentos.filter((p) => p.ativo).length === 0 ? (
                <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">
                  Nenhum procedimento ativo cadastrado.
                </p>
              ) : (
                <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
                  {procedimentos
                    .filter((p) => p.ativo)
                    .map((p) => (
                      <label
                        key={p.codigo}
                        className="flex items-center gap-2.5 text-sm text-ink"
                      >
                        <input
                          type="checkbox"
                          checked={procedureCodes.includes(p.codigo)}
                          onChange={() => toggleItem(setProcedureCodes, p.codigo)}
                          className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-100"
                        />
                        <span>
                          {p.nome}
                          {p.categoria ? (
                            <span className="text-muted"> · {p.categoria}</span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                </div>
              )}
              <p className="mt-1 text-xs text-muted">
                {procedureCodes.length} selecionado(s).
              </p>
            </div>
          )}

          {tipo === "Exame" && (
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Exames atendidos
              </span>
              <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
                {EXAMES_TUSS.map((ex) => (
                  <label
                    key={ex.tuss}
                    className="flex items-center gap-2.5 text-sm text-ink"
                  >
                    <input
                      type="checkbox"
                      checked={examCodes.includes(ex.tuss)}
                      onChange={() => toggleItem(setExamCodes, ex.tuss)}
                      className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-100"
                    />
                    <span>
                      {ex.nome}
                      <span className="text-muted"> · {ex.categoria}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">
                {examCodes.length} selecionado(s).
              </p>
            </div>
          )}

          {editMode && (
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
                className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-500"
              />
              <span className="text-sm font-medium text-ink">Escala ativa</span>
            </label>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Dias da semana */}
          <div>
            <span className="mb-2 block text-sm font-medium text-ink">
              Dias de Atendimento
            </span>
            <div className="flex flex-wrap gap-2">
              {DIAS.map((d) => {
                const on = dias.includes(d.n);
                const isWeekend = d.n === 0 || d.n === 6;
                const estado = on
                  ? isWeekend
                    ? "bg-status-danger text-white"
                    : "bg-brand-500 text-white"
                  : isWeekend
                    ? "border border-weekend/60 text-weekend hover:bg-weekend/10"
                    : "border border-line text-ink hover:bg-muted-surface";
                return (
                  <button
                    key={d.n}
                    type="button"
                    onClick={() => toggleDia(d.n)}
                    className={`h-10 w-12 rounded-lg text-sm font-semibold transition-colors ${estado}`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vigência da escala (período de validade) */}
          <div>
            <span className="mb-2 block text-sm font-medium text-ink">
              Período de Vigência
            </span>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Data Inicial"
                type="date"
                value={dataInicio}
                max={dataFim || undefined}
                onChange={(e) => setDataInicio(e.target.value)}
              />
              <Input
                label="Data Final"
                type="date"
                value={dataFim}
                min={dataInicio || undefined}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
            <p className="mt-1 text-xs text-muted">
              A escala só vale (gera horários na agenda) dentro deste período.
            </p>
          </div>

          {/* Faixa de horário */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Horário Inicial"
              type="time"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
            <Input
              label="Horário Final"
              type="time"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
            />
          </div>

          {/* Data alvo dos bloqueios (schedule_blocks é por data específica) */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Data para Bloqueios"
              type="date"
              value={dataBloqueio}
              onChange={(e) => setDataBloqueio(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={gerarGrade}>
              <Sparkles className="h-4 w-4" />
              Gerar Grade Automática
            </Button>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                className="w-32"
                aria-label="Horário manual"
              />
              <Button variant="outline" size="sm" onClick={adicionarManual}>
                <Plus className="h-4 w-4" />
                Adicionar Horário
              </Button>
            </div>
          </div>

          {slots.length > 0 && (
            <p className="text-xs text-muted">
              Clique num horário livre para bloquear — será pedido o motivo.
              Clique num bloqueado para liberar. O bloqueio é salvo para o
              profissional na data acima.
            </p>
          )}

          {/* Grade gerada */}
          {slots.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-10 text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
                <CalendarRange className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm text-muted">
                Gere a grade automática ou adicione horários manualmente
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((s) => (
                <button
                  key={s.hora}
                  type="button"
                  onClick={() => aoClicarSlot(s.hora)}
                  disabled={blockPending}
                  className={`flex h-10 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors disabled:opacity-60 ${
                    s.bloqueado
                      ? "border-red-300 bg-red-50 text-red-600"
                      : "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                  }`}
                  title={
                    s.bloqueado
                      ? `Bloqueado: ${s.motivo || "sem motivo"} — clique para liberar`
                      : "Bloquear horário"
                  }
                >
                  {s.bloqueado ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <Unlock className="h-3.5 w-3.5" />
                  )}
                  {s.hora}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Diálogo de motivo do bloqueio — exige o porquê antes de persistir e
          impede que um clique acidental bloqueie o horário. */}
      {bloqueioAlvo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !blockPending && setBloqueioAlvo(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface p-5 shadow-xl">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              <Lock className="h-4 w-4 text-red-500" />
              Bloquear horário {bloqueioAlvo}
            </h3>
            <p className="mt-0.5 text-sm text-muted">
              {dataBloqueio.split("-").reverse().join("/")} · informe o motivo do
              bloqueio.
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Motivo do bloqueio <span className="text-red-500">*</span>
              </span>
              <textarea
                autoFocus
                rows={3}
                value={motivoBloqueio}
                onChange={(e) => setMotivoBloqueio(e.target.value)}
                placeholder="Ex.: Médico em congresso, manutenção da sala, almoço..."
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setBloqueioAlvo(null)}
                disabled={blockPending}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={confirmarBloqueio}
                disabled={blockPending}
              >
                <Lock className="h-4 w-4" />
                {blockPending ? "Bloqueando..." : "Confirmar bloqueio"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 flex-1 rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
