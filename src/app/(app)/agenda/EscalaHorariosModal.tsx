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
import {
  createSchedule,
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
type SlotEscala = { hora: string; bloqueado: boolean; blockId?: string };

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
}: {
  open: boolean;
  onClose: () => void;
  profissionais: Profissional[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [aba, setAba] = useState<Aba>("dados");
  const [descricao, setDescricao] = useState("");
  const [profissionalId, setProfissionalId] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [tipo, setTipo] = useState(TIPOS[0]);
  const [slotMin, setSlotMin] = useState(30);
  const [encaixe, setEncaixe] = useState(0);

  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5]);
  const [inicio, setInicio] = useState("08:00");
  const [fim, setFim] = useState("18:00");
  const [slots, setSlots] = useState<SlotEscala[]>([]);
  const [manual, setManual] = useState("");
  // Data alvo para persistência de bloqueios em schedule_blocks.
  const [dataBloqueio, setDataBloqueio] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [blockPending, startBlock] = useTransition();

  // Sincroniza os bloqueios persistidos quando há profissional + data + grade.
  useEffect(() => {
    if (!open || !profissionalId || !dataBloqueio || slots.length === 0) return;
    let ativo = true;
    (async () => {
      const blocks = await listBlocks(profissionalId, dataBloqueio);
      if (!ativo) return;
      const porHora = new Map(blocks.map((b) => [b.hora, b.id]));
      setSlots((cur) =>
        cur.map((s) => {
          const blockId = porHora.get(s.hora);
          return blockId
            ? { ...s, bloqueado: true, blockId }
            : { ...s, bloqueado: false, blockId: undefined };
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
   * Bloqueia/desbloqueia um horário, persistindo em schedule_blocks.
   * Exige profissional + data selecionados (o bloqueio é por data específica).
   */
  function toggleBloqueio(hora: string) {
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

    startBlock(async () => {
      if (slot.bloqueado && slot.blockId) {
        // Desbloquear: remove o registro persistido.
        const res = await removeBlock(slot.blockId);
        if (res?.ok) {
          setSlots((cur) =>
            cur.map((s) =>
              s.hora === hora ? { ...s, bloqueado: false, blockId: undefined } : s,
            ),
          );
          router.refresh();
        } else {
          toast.error(res?.error ?? "Não foi possível desbloquear o horário.");
        }
        return;
      }
      // Bloquear: cria o registro e guarda o id retornado.
      const res = await createBlock({
        professional_id: profissionalId,
        date: dataBloqueio,
        time: hora,
        reason: descricao.trim() || "Bloqueio manual",
      });
      if (res?.ok) {
        setSlots((cur) =>
          cur.map((s) =>
            s.hora === hora
              ? { ...s, bloqueado: true, blockId: res.protocol }
              : s,
          ),
        );
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
    startTransition(async () => {
      const res = await createSchedule({
        description: descricao,
        professional_id: profissionalId,
        specialty: especialidade,
        service_type: tipo,
        slot_minutes: slotMin,
        overbook_limit: encaixe,
        weekdays: dias,
        start_time: inicio,
        end_time: fim,
      });
      if (res?.ok) {
        toast.success(`Escala ${res.protocol ?? ""} salva com sucesso.`);
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
      title="Configuração de Escala de Horários"
      subtitle="Defina a grade de atendimento de um profissional"
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={salvar} disabled={pending}>
            <Save className="h-4 w-4" />
            {pending ? "Salvando..." : "Salvar Escala"}
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
              AUTO
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
            label="Tipo de Atendimento"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            {TIPOS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
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
              Clique num horário para bloquear/desbloquear. O bloqueio é salvo
              para o profissional na data acima.
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
                  onClick={() => toggleBloqueio(s.hora)}
                  disabled={blockPending}
                  className={`flex h-10 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors disabled:opacity-60 ${
                    s.bloqueado
                      ? "border-red-300 bg-red-50 text-red-600"
                      : "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                  }`}
                  title={s.bloqueado ? "Desbloquear horário" : "Bloquear horário"}
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
