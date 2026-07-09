"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Plus,
  Unlock,
  CalendarRange,
  Search,
  X,
  Repeat,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { type Escala } from "@/lib/data/schedules";
import { type AttendanceOption } from "@/lib/data/attendance-options.shared";
import { type Procedimento } from "@/lib/data/procedures";
import { type Profissional } from "@/lib/data/professionals";
import { EXAMES_TUSS } from "@/lib/clinico/exames-shared";
import { createSchedule, updateSchedule } from "@/lib/actions/appointments";

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
/**
 * Horário da grade da escala. A escala é por ESPECIALIDADE: a grade só define
 * a faixa de horários; o (único) estado operacional é o bloqueio fixo
 * (recorrente), mantido à parte em `recorrentes`.
 */
/** Bloqueio fixo de um horário no dia. */
type Bloco = { time: string; reason: string };
/** Faixa + bloqueios próprios de um dia da semana. */
type DiaFaixa = { start: string; end: string; blocks: Bloco[] };

/** "YYYY-MM-DD" → "dd/mm/aaaa" (para mensagens ao usuário). */
function fmtDataBR(iso: string): string {
  const [y, m, d] = (iso || "").slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

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
  especialidades,
  procedimentos,
  profissionais,
  escalas = [],
  escalaParaEditar,
}: {
  open: boolean;
  onClose: () => void;
  /** Catálogo de especialidades (attendance_options), fonte única do sistema. */
  especialidades: AttendanceOption[];
  procedimentos: Procedimento[];
  profissionais: Profissional[];
  /** Escalas existentes — usadas p/ avisar de conflito (escala única por especialidade). */
  escalas?: Escala[];
  /** Quando presente, o modal abre em modo edição (pré-preenche + updateSchedule). */
  escalaParaEditar?: Escala;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const editMode = Boolean(escalaParaEditar);

  // Estado inicializado DIRETO das props: modo edição pré-preenche pela escala,
  // criação usa os defaults. O reset entre aberturas é feito por REMONT (o pai
  // passa um `key` que muda a cada abertura) — por isso não há effect de
  // pré-preenchimento (evita setState síncrono dentro de effect).
  const esc = escalaParaEditar;

  const [aba, setAba] = useState<Aba>("dados");
  const [descricao, setDescricao] = useState(esc?.description ?? "");
  const [especialidade, setEspecialidade] = useState(esc?.specialty ?? "");
  const [profissionalId, setProfissionalId] = useState(esc?.professionalId ?? "");
  const [lateralidade, setLateralidade] = useState(esc?.lateralidade ?? "");
  const [obs, setObs] = useState(esc?.obs ?? "");
  const [tipo, setTipo] = useState(esc?.serviceType || TIPOS[0]);
  const [slotMin, setSlotMin] = useState(esc?.slotMinutes ?? 30);
  const [encaixe, setEncaixe] = useState(esc?.overbookLimit ?? 0);
  const [ativo, setAtivo] = useState(esc?.active ?? true);
  // Itens atendidos pela escala (conforme o Tipo de Escala).
  const [procedureCodes, setProcedureCodes] = useState<string[]>(
    esc?.procedureCodes ?? [],
  );
  const [examCodes, setExamCodes] = useState<string[]>(esc?.examTussCodes ?? []);

  const [dias, setDias] = useState<number[]>(esc?.weekdays ?? [1, 2, 3, 4, 5]);
  // Ponto de partida ao marcar um novo dia — NÃO é editável na UI (o que vale é
  // sempre o horário por dia). Criação parte de 08–18; edição parte do horário
  // já salvo na escala (para não perder a faixa de escalas antigas sem week_hours).
  const inicio = esc?.startTime ?? "08:00";
  const fim = esc?.endTime ?? "18:00";
  // Horário PRÓPRIO por dia (0=Dom..6=Sáb): faixa + bloqueios daquele dia. Ao
  // editar uma escala antiga sem week_hours, cada dia vem com o horário base; os
  // bloqueios do dia vêm do week_hours[dia].blocks (ou, legado, dos globais).
  const [horariosPorDia, setHorariosPorDia] = useState<Record<number, DiaFaixa>>(
    () => {
      const baseStart = esc?.startTime ?? "08:00";
      const baseEnd = esc?.endTime ?? "18:00";
      const diasIniciais = esc?.weekdays ?? [1, 2, 3, 4, 5];
      const legado = esc?.recurringBlocks ?? [];
      const out: Record<number, DiaFaixa> = {};
      for (const d of diasIniciais) {
        const wh = esc?.weekHours?.[String(d)];
        out[d] = {
          start: wh?.start ?? baseStart,
          end: wh?.end ?? baseEnd,
          blocks: wh?.blocks ? wh.blocks.map((b) => ({ ...b })) : legado.map((b) => ({ ...b })),
        };
      }
      return out;
    },
  );
  // Dia selecionado para gerar/ver a grade de horários (bloqueios são por dia).
  const [diaGrade, setDiaGrade] = useState<number | null>(
    () => (esc?.weekdays ?? [1, 2, 3, 4, 5])[0] ?? null,
  );
  // Vigência da escala (período de validade).
  const [dataInicio, setDataInicio] = useState(esc?.startDate ?? "");
  const [dataFim, setDataFim] = useState(esc?.endDate ?? "");

  // Escala única por especialidade: procura uma escala ATIVA da MESMA
  // especialidade com vigência sobreposta ao período informado (ignora a
  // própria na edição). Aviso em tempo real; o servidor também bloqueia.
  const conflito = useMemo(() => {
    const esp = especialidade.trim();
    if (!esp || !dataInicio || !dataFim || dataFim < dataInicio) return null;
    return (
      escalas.find((e) => {
        if (!e.active) return false;
        if (e.specialty !== esp || e.serviceType !== tipo) return false;
        if (escalaParaEditar && e.id === escalaParaEditar.id) return false;
        const s = (e.startDate || "").slice(0, 10);
        const en = (e.endDate || "").slice(0, 10);
        // Escala legada sem vigência completa não entra no conflito.
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(en))
          return false;
        return s <= dataFim && dataInicio <= en;
      }) ?? null
    );
  }, [escalas, especialidade, dataInicio, dataFim, escalaParaEditar]);
  // Diálogo de bloqueio do horário no dia selecionado: alvo + motivo.
  const [bloqueioAlvo, setBloqueioAlvo] = useState<string | null>(null);
  const [motivoBloqueio, setMotivoBloqueio] = useState("");

  // Bloqueios do dia atualmente selecionado na grade.
  const blocosDoDia =
    diaGrade != null ? (horariosPorDia[diaGrade]?.blocks ?? []) : [];
  // Grade DERIVADA do dia selecionado (início/fim daquele dia + duração).
  // Deriva de diaGrade → nunca dessincroniza (some a classe de bugs de estado).
  const gradeHoras = useMemo(() => {
    const faixa = diaGrade != null ? horariosPorDia[diaGrade] : undefined;
    return faixa ? gerarHorarios(faixa.start, faixa.end, slotMin) : [];
  }, [diaGrade, horariosPorDia, slotMin]);

  // Opções do Select vêm do catálogo. Em edição, preserva o valor atual mesmo
  // que não esteja (mais) no catálogo, para não perder o dado da escala.
  const listaEspecialidades = useMemo(() => {
    const opts = especialidades
      .map((e) => ({ value: e.value, label: e.label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    const atual = esc?.specialty ?? "";
    if (atual && !opts.some((o) => o.value === atual)) {
      return [{ value: atual, label: atual }, ...opts];
    }
    return opts;
  }, [especialidades, esc]);

  function toggleDia(n: number) {
    setDias((cur) => {
      const jaTem = cur.includes(n);
      setHorariosPorDia((h) => {
        const next = { ...h };
        if (jaTem) delete next[n];
        else next[n] = { start: inicio, end: fim, blocks: [] };
        return next;
      });
      // Ao ligar, passa a editar a grade desse dia; ao desligar o dia atual,
      // escolhe outro dia selecionado (ou nenhum).
      if (jaTem) {
        if (diaGrade === n) {
          const resto = cur.filter((d) => d !== n);
          setDiaGrade(resto.length ? resto[0] : null);
        }
      } else {
        setDiaGrade(n);
      }
      return jaTem ? cur.filter((d) => d !== n) : [...cur, n];
    });
  }

  /** Ajusta o horário próprio (início/fim) de um dia específico. */
  function setHorarioDia(n: number, campo: "start" | "end", valor: string) {
    setHorariosPorDia((h) => ({
      ...h,
      [n]: { ...(h[n] ?? { start: inicio, end: fim, blocks: [] }), [campo]: valor },
    }));
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

  /**
   * Seleciona o (único) procedimento da escala e já preenche o Tempo de
   * Atendimento com a duração cadastrada do procedimento (o campo segue
   * editável caso a clínica queira ajustar para esta escala).
   */
  function selecionarProcedimento(code: string) {
    setProcedureCodes([code]);
    const p = procedimentos.find((x) => x.codigo === code);
    if (p && p.duracaoNum > 0) setSlotMin(p.duracaoNum);
  }

  const EXAME_DURACOES: Record<string, number> = {
    "40304361": 15,
    "40301630": 15,
    "40301826": 15,
    "40301842": 15,
    "40316105": 15,
    "40302350": 15,
    "40302679": 15,
    "40311070": 15,
    "40901114": 20,
    "40901157": 30,
    "40808017": 20,
    "40901041": 45,
  };

  function selecionarExame(code: string) {
    const jaTem = examCodes.includes(code);
    toggleItem(setExamCodes, code);
    if (!jaTem) {
      const duration = EXAME_DURACOES[code];
      if (duration) setSlotMin(duration);
    }
  }

  function aplicarVigenciaRapida(dias: number) {
    const base = dataInicio ? new Date(dataInicio + "T00:00:00") : new Date();
    if (!dataInicio) {
      setDataInicio(base.toISOString().slice(0, 10));
    }
    const fim = new Date(base.getTime());
    fim.setDate(fim.getDate() + dias);
    setDataFim(fim.toISOString().slice(0, 10));
  }

  // Dias selecionados na ordem de exibição (Seg→Dom).
  const diasOrdenados = useMemo(
    () => DIAS.filter((d) => dias.includes(d.n)),
    [dias],
  );

  /** Altera os bloqueios do dia selecionado na grade. */
  function setBlocosDoDia(fn: (cur: Bloco[]) => Bloco[]) {
    if (diaGrade == null) return;
    setHorariosPorDia((h) => {
      const atual = h[diaGrade] ?? { start: inicio, end: fim, blocks: [] };
      return { ...h, [diaGrade]: { ...atual, blocks: fn(atual.blocks) } };
    });
  }

  /**
   * Clique num horário da grade do dia selecionado. Bloqueio vale SÓ neste dia:
   * se já bloqueado → libera; se livre → abre o diálogo para informar o motivo.
   */
  function aoClicarSlot(hora: string) {
    if (diaGrade == null) return;
    if (blocosDoDia.some((r) => r.time === hora)) {
      setBlocosDoDia((cur) => cur.filter((r) => r.time !== hora));
      toast.info(`${hora} liberado — salve a escala para confirmar.`);
      return;
    }
    setMotivoBloqueio("");
    setBloqueioAlvo(hora);
  }

  /** Confirma o bloqueio do horário-alvo (no dia selecionado) com o motivo. */
  function confirmarBloqueio() {
    const hora = bloqueioAlvo;
    if (!hora || diaGrade == null) return;
    const motivo = motivoBloqueio.trim();
    if (motivo.length < 3) {
      toast.error("Descreva o motivo do bloqueio (mínimo 3 caracteres).");
      return;
    }
    setBlocosDoDia((cur) =>
      cur.some((r) => r.time === hora) ? cur : [...cur, { time: hora, reason: motivo }],
    );
    setBloqueioAlvo(null);
    setMotivoBloqueio("");
    toast.success(`${hora} bloqueado — salve a escala para confirmar.`);
  }

  function salvar() {
    if (descricao.trim().length < 2) {
      toast.error("Informe a descrição da escala.");
      setAba("dados");
      return;
    }
    if ((tipo === "Consulta" || tipo === "Retorno") && !especialidade) {
      toast.error("Selecione a especialidade da escala.");
      setAba("dados");
      return;
    }
    if (tipo === "Procedimento" && procedureCodes.length === 0) {
      toast.error("Selecione ao menos um procedimento para a escala.");
      setAba("dados");
      return;
    }
    if (tipo === "Exame" && examCodes.length === 0) {
      toast.error("Selecione ao menos um exame para a escala.");
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
    // Escala única por especialidade: bloqueia se houver conflito de período.
    if (conflito) {
      toast.error(
        `Já existe a escala ${conflito.code} (${conflito.specialty}) no período de ${fmtDataBR(conflito.startDate)} a ${fmtDataBR(conflito.endDate)}. Ajuste o período ou desative a escala existente.`,
      );
      setAba("horarios");
      return;
    }
    // Valida cada dia (fim > início) e monta o week_hours (com bloqueios do dia)
    // + envelope base. Bloqueios agora são por dia; recurring_blocks fica vazio.
    const week_hours: Record<string, DiaFaixa> = {};
    let envInicio = "";
    let envFim = "";
    for (const d of diasOrdenados) {
      const faixa = horariosPorDia[d.n] ?? { start: inicio, end: fim, blocks: [] };
      if (
        !/^\d{2}:\d{2}$/.test(faixa.start) ||
        !/^\d{2}:\d{2}$/.test(faixa.end) ||
        faixa.end <= faixa.start
      ) {
        toast.error(
          `Horário inválido em ${d.label}: o fim deve ser maior que o início.`,
        );
        setAba("horarios");
        return;
      }
      // Mantém só os bloqueios DENTRO da faixa do dia (descarta órfãos, ex.:
      // globais legados copiados para um dia de faixa mais estreita).
      const blocosNaFaixa = (faixa.blocks ?? []).filter(
        (b) => b.time >= faixa.start && b.time < faixa.end,
      );
      week_hours[String(d.n)] = {
        start: faixa.start,
        end: faixa.end,
        blocks: blocosNaFaixa,
      };
      if (!envInicio || faixa.start < envInicio) envInicio = faixa.start;
      if (!envFim || faixa.end > envFim) envFim = faixa.end;
    }
    startTransition(async () => {
      const payload = {
        description: descricao,
        professional_id: profissionalId || "",
        specialty: especialidade,
        service_type: tipo,
        slot_minutes: slotMin,
        overbook_limit: encaixe,
        weekdays: dias,
        // Envelope base = menor início e maior fim entre os dias.
        start_time: envInicio || inicio,
        end_time: envFim || fim,
        week_hours,
        start_date: dataInicio,
        end_date: dataFim,
        // Só guarda o conjunto do tipo atual; limpa o outro ao trocar de tipo.
        procedure_codes: tipo === "Procedimento" ? procedureCodes : [],
        exam_tuss_codes: tipo === "Exame" ? examCodes : [],
        // Bloqueios agora são por dia (em week_hours[dia].blocks); global vazio.
        recurring_blocks: [],
        lateralidade: tipo === "Exame" ? lateralidade : "",
        obs: tipo === "Exame" ? obs : "",
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
      subtitle="Defina a grade de atendimento de uma especialidade"
      className="max-w-5xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={salvar}
            disabled={pending || Boolean(conflito)}
            title={
              conflito
                ? "Já existe uma escala desta especialidade neste período."
                : undefined
            }
          >
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
            disabled={tipo === "Procedimento" || tipo === "Exame"}
          />
          <Input
            label="Limite de Encaixe"
            type="number"
            min={0}
            value={encaixe}
            onChange={(e) => setEncaixe(Number(e.target.value))}
          />
          <Select
            label="Tipo de Escala"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            {TIPOS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          <Select
            label="Especialidade *"
            value={especialidade}
            onChange={(e) => {
              setEspecialidade(e.target.value);
              setProfissionalId(""); // clear on change
            }}
            required
          >
            <option value="">Selecione a especialidade</option>
            {listaEspecialidades.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </Select>
          <Select
            label="Profissional"
            value={profissionalId}
            onChange={(e) => setProfissionalId(e.target.value)}
            disabled={!especialidade}
          >
            <option value="">Selecione o profissional (opcional)</option>
            {(especialidade
              ? profissionais.filter((p) => p.especialidade === especialidade)
              : profissionais
            ).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted sm:col-span-2">
            {tipo === "Procedimento"
              ? "A escala define o horário para os procedimentos selecionados."
              : tipo === "Exame"
                ? "A escala define o horário para os exames selecionados."
                : "A escala é definida por especialidade/profissional e vale para os atendimentos vinculados."}
          </p>

          {/* Lateralidade e Observações de Exame */}
          {tipo === "Exame" && (
            <>
              <Select
                label="Lateralidade"
                value={lateralidade}
                onChange={(e) => setLateralidade(e.target.value)}
              >
                <option value="">Não informado / Não se aplica</option>
                <option value="Direita">Direita</option>
                <option value="Esquerda">Esquerda</option>
                <option value="Bilateral">Bilateral</option>
                <option value="Não se aplica">Não se aplica</option>
              </Select>
              <Input
                label="Observações do Exame"
                placeholder="Ex.: Requer jejum de 8h"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
              />
            </>
          )}

          {/* Itens da escala: aparece conforme o Tipo de Escala. */}
          {tipo === "Procedimento" && (
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Procedimento atendido
              </span>
              {procedimentos.filter((p) => p.ativo).length === 0 ? (
                <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">
                  Nenhum procedimento ativo cadastrado.
                </p>
              ) : (
                <BuscaItens
                  single
                  options={procedimentos
                    .filter((p) => p.ativo)
                    .map((p) => ({
                      code: p.codigo,
                      nome: p.nome,
                      sub: p.categoria !== "—" ? p.categoria : undefined,
                    }))}
                  selected={procedureCodes}
                  onPick={selecionarProcedimento}
                  onRemove={() => setProcedureCodes([])}
                  placeholder="Buscar procedimento..."
                  vazio="Nenhum procedimento encontrado."
                />
              )}
              <p className="mt-1 text-xs text-muted">
                O tempo de atendimento é preenchido com a duração do
                procedimento (respeitado o cadastro).
              </p>
            </div>
          )}

          {tipo === "Exame" && (
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Exames atendidos
              </span>
              <BuscaItens
                options={EXAMES_TUSS.map((ex) => ({
                  code: ex.tuss,
                  nome: ex.nome,
                  sub: ex.categoria,
                }))}
                selected={examCodes}
                onPick={selecionarExame}
                onRemove={selecionarExame}
                placeholder="Buscar exame..."
                vazio="Nenhum exame encontrado."
              />
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
            <p className="mt-1.5 text-xs text-muted">
              Cada dia marcado tem seu <strong>próprio horário</strong> (ex.:
              Seg 08–18 e Ter 08–13). Marque os dias e ajuste o horário de cada
              um logo abaixo.
            </p>
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
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="text-xs text-muted self-center mr-1">Atalho de vigência:</span>
              <button
                type="button"
                className="rounded bg-brand-50 hover:bg-brand-100 text-brand-700 px-2 py-1 text-xs font-semibold"
                onClick={() => aplicarVigenciaRapida(30)}
              >
                1 Mês
              </button>
              <button
                type="button"
                className="rounded bg-brand-50 hover:bg-brand-100 text-brand-700 px-2 py-1 text-xs font-semibold"
                onClick={() => aplicarVigenciaRapida(90)}
              >
                1 Trimestre
              </button>
              <button
                type="button"
                className="rounded bg-brand-50 hover:bg-brand-100 text-brand-700 px-2 py-1 text-xs font-semibold"
                onClick={() => aplicarVigenciaRapida(180)}
              >
                1 Semestre
              </button>
              <button
                type="button"
                className="rounded bg-brand-50 hover:bg-brand-100 text-brand-700 px-2 py-1 text-xs font-semibold"
                onClick={() => aplicarVigenciaRapida(365)}
              >
                1 Ano
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">
              A escala só vale (gera horários na agenda) dentro deste período.
            </p>
            {conflito && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Já existe a escala <strong>{conflito.code}</strong> de{" "}
                  <strong>{especialidade.trim()}</strong> no período{" "}
                  <strong>
                    {fmtDataBR(conflito.startDate)} a {fmtDataBR(conflito.endDate)}
                  </strong>
                  . Só pode haver <strong>uma escala por especialidade</strong> no
                  mesmo período — ajuste as datas ou desative a escala existente.
                </span>
              </div>
            )}
          </div>

          {/* Horário próprio por dia */}
          {diasOrdenados.length > 0 && (
            <div>
              <span className="mb-2 block text-sm font-medium text-ink">
                Horário por Dia
              </span>
              <div className="space-y-2">
                {diasOrdenados.map((d) => {
                  const faixa = horariosPorDia[d.n] ?? {
                    start: inicio,
                    end: fim,
                  };
                  return (
                    <div
                      key={d.n}
                      className="flex items-center gap-3 rounded-lg border border-line px-3 py-2"
                    >
                      <span className="w-10 shrink-0 text-sm font-semibold text-ink">
                        {d.label}
                      </span>
                      <Input
                        type="time"
                        aria-label={`Início de ${d.label}`}
                        value={faixa.start}
                        onChange={(e) =>
                          setHorarioDia(d.n, "start", e.target.value)
                        }
                        className="w-32"
                      />
                      <span className="text-sm text-muted">até</span>
                      <Input
                        type="time"
                        aria-label={`Fim de ${d.label}`}
                        value={faixa.end}
                        onChange={(e) =>
                          setHorarioDia(d.n, "end", e.target.value)
                        }
                        className="w-32"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Grade por DIA: escolha o dia e gere/edite os horários dele */}
          {diasOrdenados.length > 0 && (
            <div>
              <span className="mb-2 block text-sm font-medium text-ink">
                Grade do dia
              </span>
              <div className="flex flex-wrap gap-2">
                {diasOrdenados.map((d) => {
                  const on = diaGrade === d.n;
                  const nBlocks = horariosPorDia[d.n]?.blocks?.length ?? 0;
                  return (
                    <button
                      key={d.n}
                      type="button"
                      onClick={() => setDiaGrade(d.n)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                        on
                          ? "border-brand-500 bg-brand-500 text-white"
                          : "border-line text-ink hover:bg-muted-surface"
                      }`}
                    >
                      {d.label}
                      {nBlocks > 0 && (
                        <span className={on ? "text-white/80" : "text-amber-600"}>
                          {" "}
                          ({nBlocks})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-muted">
                Escolha um dia: a grade dele é gerada automaticamente a partir do
                horário do dia. Clique num horário para bloquear/liberar — vale{" "}
                <strong>só naquele dia</strong>.
              </p>
            </div>
          )}

          {gradeHoras.length > 0 && (
            <div className="space-y-2">
              {/* Legenda dos estados */}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded border border-green-300 bg-green-50" />
                  Livre
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded border border-amber-300 bg-amber-50" />
                  Bloqueado (neste dia)
                </span>
              </div>
              <p className="text-xs text-muted">
                Grade de{" "}
                <strong>
                  {DIAS.find((d) => d.n === diaGrade)?.label ?? "—"}
                </strong>
                . Clique num horário livre para bloqueá-lo{" "}
                <strong>só neste dia</strong> (será pedido o motivo); clique num
                bloqueado para liberar. Salvo ao salvar a escala.
              </p>
            </div>
          )}

          {/* Grade gerada (derivada do dia selecionado) */}
          {gradeHoras.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-10 text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
                <CalendarRange className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm text-muted">
                {diasOrdenados.length === 0
                  ? "Selecione os dias de atendimento acima."
                  : "Escolha um dia em “Grade do dia” para ver os horários."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {gradeHoras.map((hora) => {
                const bloqueado = blocosDoDia.find((r) => r.time === hora);
                const estilo = bloqueado
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-green-300 bg-green-50 text-green-700 hover:bg-green-100";
                return (
                  <button
                    key={hora}
                    type="button"
                    onClick={() => aoClicarSlot(hora)}
                    className={`flex h-10 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors ${estilo}`}
                    title={
                      bloqueado
                        ? `Bloqueado neste dia: ${bloqueado.reason || "sem motivo"} — clique para liberar`
                        : "Bloquear horário (só neste dia)"
                    }
                  >
                    {bloqueado ? (
                      <Repeat className="h-3.5 w-3.5" />
                    ) : (
                      <Unlock className="h-3.5 w-3.5" />
                    )}
                    {hora}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Diálogo de motivo do bloqueio do dia — exige o porquê antes de aplicar. */}
      {bloqueioAlvo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setBloqueioAlvo(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface p-5 shadow-xl">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              <Repeat className="h-4 w-4 text-amber-500" />
              Bloquear {bloqueioAlvo}
              {diaGrade != null
                ? ` — ${DIAS.find((d) => d.n === diaGrade)?.label ?? ""}`
                : ""}
            </h3>
            <p className="mt-0.5 text-sm text-muted">
              Vale só neste dia. Informe o motivo.
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
              <Button variant="ghost" onClick={() => setBloqueioAlvo(null)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={confirmarBloqueio}>
                <Repeat className="h-4 w-4" />
                Confirmar bloqueio
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

/** Opção pesquisável (código + nome + subtítulo opcional). */
type OpcaoItem = { code: string; nome: string; sub?: string };

/**
 * Campo de busca com seleção por chips. Em vez de listar todos os itens, o
 * usuário digita e escolhe nos resultados filtrados. `single` mantém só uma
 * seleção (esconde a busca enquanto há item escolhido).
 */
function BuscaItens({
  options,
  selected,
  onPick,
  onRemove,
  single = false,
  placeholder = "Digite para buscar...",
  vazio = "Nenhum item encontrado.",
}: {
  options: OpcaoItem[];
  selected: string[];
  onPick: (code: string) => void;
  onRemove: (code: string) => void;
  single?: boolean;
  placeholder?: string;
  vazio?: string;
}) {
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    return options
      .filter((o) => !selected.includes(o.code))
      .filter((o) =>
        term
          ? o.nome.toLowerCase().includes(term) ||
            o.code.toLowerCase().includes(term) ||
            (o.sub ?? "").toLowerCase().includes(term)
          : true,
      )
      .slice(0, 8);
  }, [options, selected, q]);

  const escolhidas = options.filter((o) => selected.includes(o.code));

  return (
    <div>
      {escolhidas.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {escolhidas.map((o) => (
            <span
              key={o.code}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"
            >
              {o.nome}
              <button
                type="button"
                onClick={() => onRemove(o.code)}
                aria-label={`Remover ${o.nome}`}
                className="text-brand-500 transition-colors hover:text-brand-700"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* No modo single, esconde a busca enquanto houver item escolhido. */}
      {!(single && selected.length > 0) && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setAberto(true);
            }}
            onFocus={() => setAberto(true)}
            onBlur={() => setTimeout(() => setAberto(false), 120)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {aberto && (
            <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-lg">
              {filtradas.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted">{vazio}</p>
              ) : (
                filtradas.map((o) => (
                  <button
                    key={o.code}
                    type="button"
                    // onMouseDown evita o blur do input antes do clique registrar.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onPick(o.code);
                      setQ("");
                      if (single) setAberto(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-muted-surface"
                  >
                    <span>
                      {o.nome}
                      {o.sub ? <span className="text-muted"> · {o.sub}</span> : null}
                    </span>
                    <Plus className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
