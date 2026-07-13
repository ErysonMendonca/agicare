"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Save, Printer, AlertTriangle } from "lucide-react";
import { type DadosAtendimentoDoc } from "../../FichaAtendimento";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { salvarAtendimento } from "@/lib/actions/queue";
import { type FilaItem } from "@/lib/data/queue";
import { ehMenor } from "@/app/(app)/pacientes/pacienteForm.shared";
import { useConfirm } from "@/lib/store/confirm";
import type {
  AttendanceOption,
  AttendanceOptionsByCategory,
} from "@/lib/data/attendance-options";
import type { ConsentTemplate } from "@/lib/data/consent-templates";
import type { ClinicaImpressao } from "@/app/(app)/prontuario/[patientId]/documentos/AtestadoImpressao";
import { DocumentosAtendimentoModal } from "./DocumentosAtendimentoModal";

/** Papel (cru do banco) → rótulo de função exibível na ficha. */
const FUNCAO_LABEL: Record<string, string> = {
  admin: "Administrador",
  medico: "Médico",
  recepcao: "Recepção",
  paciente: "Paciente",
};
function labelFuncao(role: string | null | undefined): string {
  if (!role) return "";
  return FUNCAO_LABEL[role] ?? role;
}

const FALLBACK: Record<string, string[]> = {
  origem: ["1 - RECEPÇÃO", "2 - PRONTO ATENDIMENTO", "3 - INTERNAÇÃO"],
  medico: ["1 - MÉDICO PADRÃO", "2 - DRA. MARINA SOUZA", "3 - DR. CARLOS EDUARDO"],
  especialidade: ["1 - MÉDICO CLÍNICO", "2 - CARDIOLOGIA", "3 - ORTOPEDIA"],
  encaminhamento: ["1 - PRIMEIRA CONSULTA", "2 - RETORNO", "3 - URGÊNCIA"],
  carater: ["1 - URGÊNCIA/EMERGÊNCIA", "2 - ELETIVO"],
  procedencia: ["9 - AMBULATÓRIO-CONS", "1 - DOMICÍLIO", "2 - OUTRA UNIDADE"],
  centro_custo: ["187 - RECEPÇÃO PRINCIPAL", "190 - PRONTO ATENDIMENTO"],
  convenio: ["SUS", "Unimed", "Particular", "Bradesco Saúde", "Amil"],
  plano: ["Ambulatorial", "Hospitalar", "Completo"],
  parentesco: ["Pai", "Mãe", "Cônjuge", "Filho(a)", "Outro"],
};

function resolveOptions(
  options: AttendanceOptionsByCategory | undefined,
  category: string,
): AttendanceOption[] {
  const list = options?.[category];
  if (list && list.length > 0) return list;
  return (FALLBACK[category] ?? []).map((label) => ({
    id: `fb-${category}-${label}`,
    label,
    value: label,
  }));
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^\s*\d+\s*-\s*/, "")
    .trim();
}

function comAgendamento(
  opts: AttendanceOption[],
  alvo: string | null | undefined,
): { options: AttendanceOption[]; value: string } {
  const t = norm(alvo ?? "");
  const bruto = (alvo ?? "").trim();
  if (!t || t === "—") return { options: opts, value: opts[0]?.value ?? "" };
  const hit = opts.find((o) => norm(o.label) === t || norm(o.value) === t);
  if (hit) return { options: opts, value: hit.value };
  const injetada: AttendanceOption = { id: `ag-${bruto}`, label: bruto, value: bruto };
  return { options: [injetada, ...opts], value: bruto };
}

type DraftShape = {
  fields: Record<string, string>;
  convenio: string;
  plano: string;
  gestante: boolean;
  oMesmo: boolean;
  respNome: string;
};

export function AtendimentoClient({
  item,
  attendanceOptions,
  profissionais = [],
  termosAtivos = [],
  clinica,
  autoReimprimir = false,
}: {
  item: FilaItem;
  attendanceOptions?: AttendanceOptionsByCategory;
  profissionais?: {
    id: string;
    nome: string;
    especialidade: string;
    ativo: boolean;
  }[];
  /** Termos de consentimento ATIVOS (impressos no modal ao salvar). */
  termosAtivos?: ConsentTemplate[];
  /** Dados da clínica p/ o cabeçalho dos documentos de impressão. */
  clinica: ClinicaImpressao;
  /** Abre automaticamente o modal de documentos ao montar (reimpressão pela fila). */
  autoReimprimir?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  const [convenio, setConvenio] = useState<string>(() => {
    const limpo = (v: string | null | undefined) =>
      v && v !== "—" ? v : "";
    const doCadastro = limpo(item.convenioCadastro);
    const doItem = limpo(item.convenio);
    return (
      doCadastro || doItem || resolveOptions(attendanceOptions, "convenio")[0]?.value || ""
    );
  });
  const [plano, setPlano] = useState("");
  const isParticular = /particular/i.test(convenio);
  // Paciente maior de idade → o responsável já nasce como "O MESMO" (não precisa
  // preencher). Menor de idade → seção do responsável começa aberta para preencher.
  const [oMesmo, setOMesmo] = useState(
    () => !ehMenor(item.pacienteNascimento ?? undefined),
  );
  const [respNome, setRespNome] = useState("");
  const [gestante, setGestante] = useState(false);

  const [dirty, setDirty] = useState(false);
  const draftKey = `draft:atendimento:v2:${item.id}`;

  const oOrigem = resolveOptions(attendanceOptions, "origem");
  const oMedico = resolveOptions(attendanceOptions, "medico");
  const oEspec = resolveOptions(attendanceOptions, "especialidade");
  const oEncam = resolveOptions(attendanceOptions, "encaminhamento");

  const tipoAgendado = (item.tipoAtendimento ?? "").trim();
  const tipoNoConfig =
    !!tipoAgendado &&
    oEncam.some(
      (o) => norm(o.label) === norm(tipoAgendado) || norm(o.value) === norm(tipoAgendado),
    );
  const oTipo: AttendanceOption[] =
    tipoAgendado && !tipoNoConfig
      ? [{ id: `ag-tipo-${tipoAgendado}`, label: tipoAgendado, value: tipoAgendado }, ...oEncam]
      : oEncam;
  const tipoDefault = tipoAgendado
    ? oTipo.find(
        (o) => norm(o.label) === norm(tipoAgendado) || norm(o.value) === norm(tipoAgendado),
      )?.value ?? tipoAgendado
    : "";

  const oCarater = resolveOptions(attendanceOptions, "carater");
  const oProced = resolveOptions(attendanceOptions, "procedencia");
  const oCentro = resolveOptions(attendanceOptions, "centro_custo");
  const oConv = resolveOptions(attendanceOptions, "convenio");
  const oPlano = resolveOptions(attendanceOptions, "plano");
  const oParent = resolveOptions(attendanceOptions, "parentesco");

  const espec = comAgendamento(oEspec, item.especialidade);
  const prof = comAgendamento(oMedico, item.medico);
  const [especSel, setEspecSel] = useState(espec.value);

  const profOptionsFor = useCallback(
    (espValue: string): AttendanceOption[] => {
      const filtrados = profissionais
        .filter((p) => norm(p.especialidade) === norm(espValue))
        .map((p) => ({ id: p.id, label: p.nome, value: p.nome }));
      const ag = (item.medico ?? "").trim();
      if (
        ag &&
        norm(ag) !== "" &&
        !filtrados.some((o) => norm(o.value) === norm(ag))
      ) {
        return [{ id: `ag-${ag}`, label: ag, value: ag }, ...filtrados];
      }
      return filtrados;
    },
    [profissionais, item.medico],
  );

  const profOptions = profOptionsFor(especSel);
  const [profSel, setProfSel] = useState(prof.value);

  function trocarEspecialidade(nova: string) {
    setEspecSel(nova);
    const opts = profOptionsFor(nova);
    if (!opts.some((o) => o.value === profSel)) {
      setProfSel(opts[0]?.value ?? "");
    }
    markDirty();
  }

  const snapshot = useCallback((): DraftShape => {
    const fields: Record<string, string> = {};
    const form = formRef.current;
    if (form) {
      for (const [k, v] of new FormData(form).entries()) {
        if (typeof v === "string") fields[k] = v;
      }
    }
    return { fields, convenio, plano, gestante, oMesmo, respNome };
  }, [convenio, plano, gestante, oMesmo, respNome]);

  const persist = useCallback(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(snapshot()));
    } catch {
      /* ignore */
    }
  }, [draftKey, snapshot]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }, [draftKey]);

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(draftKey);
    } catch {
      raw = null;
    }
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as Partial<DraftShape>;
      const fields = d.fields ?? {};
      requestAnimationFrame(() => {
        if (typeof d.convenio === "string") setConvenio(d.convenio);
        if (typeof d.plano === "string") setPlano(d.plano);
        if (typeof d.gestante === "boolean") setGestante(d.gestante);
        if (typeof d.oMesmo === "boolean") setOMesmo(d.oMesmo);
        if (typeof d.respNome === "string") setRespNome(d.respNome);
        const form = formRef.current;
        if (form) {
          for (const [k, v] of Object.entries(fields)) {
            const el = form.elements.namedItem(k) as
              | HTMLInputElement
              | HTMLSelectElement
              | HTMLTextAreaElement
              | null;
            if (el && "value" in el) el.value = v;
          }
        }
        setDirty(true);
      });
    } catch {
      /* ignore */
    }
  }, [draftKey]);

  useEffect(() => {
    if (!dirty) return;
    persist();
  }, [dirty, convenio, plano, gestante, oMesmo, respNome, persist]);

  function markDirty() {
    setDirty(true);
    persist();
  }

  function toggleOMesmo() {
    setOMesmo((v) => {
      const next = !v;
      setRespNome(next ? item.paciente : "");
      return next;
    });
    setDirty(true);
  }

  function readForm(name: string): string {
    const v = formRef.current ? new FormData(formRef.current).get(name) : null;
    return typeof v === "string" ? v : "";
  }

  function mapCarater(value: string): "urgencia" | "eletivo" | undefined {
    if (!value) return undefined;
    return /urg/i.test(value) ? "urgencia" : "eletivo";
  }

  function montarDoc(): DadosAtendimentoDoc {
    return {
      especialidade: readForm("especialidade"),
      profissional: readForm("medico"),
      tipo: readForm("encaminhamento"),
      carater: readForm("carater"),
      procedencia: readForm("procedencia"),
      centroCusto: readForm("centro_custo"),
      origem: readForm("origem"),
      dataEntrada: readForm("data_entrada"),
      gestante: gestante ? "Sim" : "Não",
      convenio,
      plano: isParticular ? "Não se aplica (Particular)" : plano,
      carteira: isParticular ? "" : readForm("carteira"),
      validade: isParticular ? "" : readForm("validade"),
      responsavel: oMesmo ? "" : respNome,
      respDocumento: oMesmo ? "" : readForm("resp_documento"),
      respParentesco: oMesmo ? "" : readForm("resp_parentesco"),
      observacoes: readForm("observacoes"),
      abertoPor: item.openedByName ?? "",
      abertoPorFuncao: labelFuncao(item.openedByRole),
    };
  }

  // Modal de documentos do atendimento (ficha + termos). Quando aberto pelo
  // fluxo de "Salvar", navega para a fila ao fechar; quando aberto pela
  // "Reimprimir Ficha", apenas fecha (não sai da tela).
  const [docsModal, setDocsModal] = useState<DadosAtendimentoDoc | null>(null);
  const [navegarAoFechar, setNavegarAoFechar] = useState(false);

  function abrirDocs(dados: DadosAtendimentoDoc, navegar: boolean) {
    setNavegarAoFechar(navegar);
    setDocsModal(dados);
  }

  function fecharDocs() {
    const navegar = navegarAoFechar;
    setDocsModal(null);
    if (navegar) {
      router.push("/fila");
      router.refresh();
    }
  }

  // Reimpressão vinda da fila (?reimprimir=1): abre o modal de documentos uma
  // única vez ao montar, sem navegar ao fechar (permanece na tela). O rAF
  // garante que o formRef já esteja montado para o montarDoc() ler os campos.
  const reimpressaoAberta = useRef(false);
  useEffect(() => {
    if (!autoReimprimir || reimpressaoAberta.current) return;
    reimpressaoAberta.current = true;
    const raf = requestAnimationFrame(() => {
      abrirDocs(montarDoc(), false);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReimprimir]);

  const handleBack = async () => {
    if (dirty) {
      const ok = await confirm({
        title: "Descartar alterações?",
        message: "Você tem alterações não salvas. Deseja realmente voltar e descartá-las?",
        danger: true,
      });
      if (!ok) return;
    }
    clearDraft();
    router.push("/fila");
  };

  async function salvar(imprimir: boolean) {
    if (pending) return;
    if (!readForm("encaminhamento")) {
      toast.error("Selecione o tipo de atendimento.");
      return;
    }
    if (!isParticular && !plano) {
      toast.error("Selecione o plano do convênio.");
      return;
    }

    startTransition(async () => {
      const res = await salvarAtendimento({
        queueEntryId: item.id,
        patientId: item.patientId,
        patientName: item.paciente,
        medico: readForm("medico"),
        especialidade: readForm("especialidade"),
        encaminhamento: readForm("encaminhamento"),
        carater: mapCarater(readForm("carater")),
        procedencia: readForm("procedencia"),
        centroCusto: readForm("centro_custo"),
        origem: readForm("origem"),
        dataEntrada: readForm("data_entrada"),
        gestante,
        convenio,
        plano: isParticular ? "" : plano,
        carteira: readForm("carteira"),
        validade: readForm("validade"),
        validador: readForm("validador"),
        respOMesmo: oMesmo,
        respNome,
        respDocumento: readForm("resp_documento"),
        respParentesco: readForm("resp_parentesco"),
        observacoes: readForm("observacoes"),
      });

      if (res?.error) {
        toast.error(res.error);
        return;
      }

      clearDraft();
      setDirty(false);
      toast.success(
        imprimir
          ? "Atendimento salvo. Confira os documentos para impressão."
          : "Atendimento salvo.",
      );
      // Abre o modal de documentos (ficha + termos). Ao fechar/concluir,
      // navega de volta para a fila. `imprimir` só muda o texto do toast —
      // a impressão fica a cargo dos botões do modal.
      abrirDocs(montarDoc(), true);
      router.refresh();
    });
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-ink hover:bg-muted-surface transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-ink">
                Ficha de Atendimento
              </h1>
              {item.tags?.map((t, idx) => (
                <span
                  key={idx}
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                    t.status === "danger"
                      ? "bg-red-50 text-red-700"
                      : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {t.label}
                </span>
              ))}
            </div>
            <p className="text-sm text-muted">
              Preencha os dados administrativos para o atendimento do paciente
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => abrirDocs(montarDoc(), false)}
            disabled={pending}
          >
            <Printer className="mr-2 h-4 w-4" />
            Reimprimir Ficha
          </Button>
          <Button variant="primary" onClick={() => salvar(false)} disabled={pending}>
            <Save className="mr-2 h-4 w-4" />
            Salvar
          </Button>
          <Button variant="primary" onClick={() => salvar(true)} disabled={pending}>
            <Printer className="mr-2 h-4 w-4" />
            Salvar e Imprimir
          </Button>
        </div>
      </div>

      {/* Main Form Area */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column (Form Fields) */}
        <div className="lg:col-span-2 space-y-6">
          <form
            ref={formRef}
            onSubmit={(e) => e.preventDefault()}
            onInput={markDirty}
          >
            {/* Seção 1: Dados do Atendimento */}
            <div className="rounded-xl border border-line bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-ink mb-4 pb-2 border-b border-line flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                  1
                </span>
                Dados do Atendimento
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <span className="mb-1.5 block text-sm font-medium text-ink">
                    Registro
                  </span>
                  <span className="inline-flex h-10 w-full items-center rounded-lg bg-brand-50 px-3 text-sm font-semibold text-brand-600">
                    {item.atendimentoCodigo || "AUTO"}
                  </span>
                </div>
                <Input
                  type="date"
                  name="data_entrada"
                  label="Data e Hora da Entrada"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
                <Select
                  name="origem"
                  label="Origem Atendimento"
                  defaultValue={oOrigem[0]?.value}
                >
                  {oOrigem.map((o) => (
                    <option key={o.id} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <div>
                  <span className="mb-1.5 block text-sm font-medium text-ink">
                    Gestante?
                  </span>
                  <Toggle
                    className="h-10 w-full rounded-lg border border-line bg-white px-3"
                    label={gestante ? "Sim" : "Não"}
                    checked={gestante}
                    onChange={(v) => {
                      setGestante(v);
                      setDirty(true);
                    }}
                  />
                </div>
                <Select
                  name={item.especialidade ? undefined : "especialidade"}
                  label="Especialidade"
                  value={especSel}
                  onChange={(e) => trocarEspecialidade(e.target.value)}
                  disabled={!!item.especialidade}
                >
                  {espec.options.map((o) => (
                    <option key={o.id} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                {!!item.especialidade && <input type="hidden" name="especialidade" value={especSel} />}
                <Select
                  name={item.medico ? undefined : "medico"}
                  label="Profissional"
                  value={profSel}
                  onChange={(e) => {
                    setProfSel(e.target.value);
                    markDirty();
                  }}
                  disabled={!!item.medico}
                >
                  {profOptions.length === 0 ? (
                    <option value="" disabled>
                      Nenhum profissional vinculado a esta especialidade
                    </option>
                  ) : (
                    profOptions.map((o) => (
                      <option key={o.id} value={o.value}>
                        {o.label}
                      </option>
                    ))
                  )}
                </Select>
                {!!item.medico && <input type="hidden" name="medico" value={profSel} />}
                <Select
                  name={item.tipoAtendimento ? undefined : "encaminhamento"}
                  label="Tipo de Atendimento *"
                  defaultValue={tipoDefault}
                  disabled={!!item.tipoAtendimento}
                >
                  {!tipoAgendado && (
                    <option value="" disabled>
                      Selecione o tipo
                    </option>
                  )}
                  {oTipo.map((o) => (
                    <option key={o.id} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                {!!item.tipoAtendimento && <input type="hidden" name="encaminhamento" value={tipoDefault} />}
                <Select
                  name="carater"
                  label="Caráter de Atendimento"
                  defaultValue={oCarater[0]?.value}
                >
                  {oCarater.map((o) => (
                    <option key={o.id} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <Select
                  name="procedencia"
                  label="Local Procedência"
                  defaultValue={oProced[0]?.value}
                >
                  {oProced.map((o) => (
                    <option key={o.id} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <Select
                  name="centro_custo"
                  label="Centro de Custo"
                  defaultValue={oCentro[0]?.value}
                >
                  {oCentro.map((o) => (
                    <option key={o.id} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Seção 2: Dados do Convênio */}
            <div className="mt-6 rounded-xl border border-line bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-ink mb-4 pb-2 border-b border-line flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                  2
                </span>
                Dados do Convênio
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Select
                  name={item.convenio ? undefined : "convenio"}
                  label="Convênio *"
                  value={convenio}
                  disabled={!!item.convenio}
                  onChange={(e) => {
                    const v = e.target.value;
                    setConvenio(v);
                    if (/particular/i.test(v)) setPlano("");
                    setDirty(true);
                  }}
                >
                  {oConv.map((o) => (
                    <option key={o.id} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                {!!item.convenio && <input type="hidden" name="convenio" value={convenio} />}
                <Select
                  label={isParticular ? "Plano" : "Plano *"}
                  value={isParticular ? "" : plano}
                  disabled={isParticular}
                  onChange={(e) => {
                    setPlano(e.target.value);
                    setDirty(true);
                  }}
                >
                  {isParticular ? (
                    <option value="">Não se aplica (Particular)</option>
                  ) : (
                    <>
                      <option value="" disabled>
                        Selecione o plano
                      </option>
                      {oPlano.map((o) => (
                        <option key={o.id} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </>
                  )}
                </Select>
                <Input
                  name="carteira"
                  label="Número da Carteirinha"
                  placeholder="Número da carteirinha"
                  disabled={isParticular}
                />
                <Input
                  type="date"
                  name="validade"
                  label="Validade da Carteirinha"
                  disabled={isParticular}
                />
                <div className="sm:col-span-2">
                  <Input
                    name="validador"
                    label="Validador de Convênio"
                    placeholder="Código do validador"
                    disabled={isParticular}
                    hint={
                      isParticular
                        ? "Atendimento particular — sem dados de convênio."
                        : "Digite o código do validador fornecido pelo convênio"
                    }
                  />
                </div>
              </div>
            </div>

            {/* Seção 3: Responsável */}
            <div className="mt-6 rounded-xl border border-line bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-ink mb-4 pb-2 border-b border-line flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                  3
                </span>
                Responsável
              </h2>
              <div>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Nome</span>
                  <div className="flex gap-2">
                    <Input
                      className="flex-1"
                      placeholder="Nome do responsável"
                      disabled={oMesmo}
                      value={respNome}
                      onChange={(e) => {
                        setRespNome(e.target.value);
                        setDirty(true);
                      }}
                    />
                    <button
                      type="button"
                      onClick={toggleOMesmo}
                      className={`h-10 flex-none rounded-lg px-4 text-sm font-semibold transition-colors ${
                        oMesmo
                          ? "bg-brand-500 text-white"
                          : "border border-line text-ink hover:bg-muted-surface"
                      }`}
                    >
                      O MESMO
                    </button>
                  </div>
                </label>
                {!oMesmo && (
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input name="resp_documento" label="Documento" placeholder="CPF ou RG" />
                    <Select name="resp_parentesco" label="Grau Parentesco" defaultValue="">
                      <option value="" disabled>
                        Informe o(a) parentesco
                      </option>
                      {oParent.map((o) => (
                        <option key={o.id} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* Seção 4: Observações */}
            <div className="mt-6 rounded-xl border border-line bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-ink mb-4 pb-2 border-b border-line flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                  4
                </span>
                Observação
              </h2>
              <textarea
                id="obs-atendimento"
                name="observacoes"
                rows={4}
                placeholder="Observações adicionais sobre o atendimento..."
                className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </form>
        </div>

        {/* Right Sidebar Column */}
        <div className="space-y-6">
          {/* Patient Card */}
          <div className="rounded-xl border border-line bg-white p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted">
              Resumo do Paciente
            </h3>

            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-white shadow-sm flex-none">
                {item.codigo}
              </span>
              <div className="min-w-0">
                <p className="font-bold text-ink truncate text-base">{item.paciente}</p>
                <p className="text-sm text-brand-600 font-medium truncate">{item.convenio}</p>
              </div>
            </div>

            <div className="border-t border-line pt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Horário Fila:</span>
                <span className="font-semibold text-ink">{item.hora}</span>
              </div>
              {item.agendamentoEm && (
                <div className="flex justify-between">
                  <span className="text-muted">Agendado em:</span>
                  <span className="font-semibold text-ink">{item.agendamentoEm}</span>
                </div>
              )}
              {item.entradaEm && (
                <div className="flex justify-between">
                  <span className="text-muted">Entrada Fila:</span>
                  <span className="font-semibold text-ink">{item.entradaEm}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted">Especialidade:</span>
                <span className="font-semibold text-ink truncate max-w-[180px]">{item.especialidade}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Profissional:</span>
                <span className="font-semibold text-ink truncate max-w-[180px]">{item.medico}</span>
              </div>
            </div>
          </div>

          {/* Draft Notification */}
          {dirty && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3 text-sm text-amber-800">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="font-bold">Alterações não salvas</p>
                <p className="mt-0.5 text-amber-700">
                  Um rascunho das suas alterações está salvo localmente no seu navegador.
                </p>
              </div>
            </div>
          )}

          {/* Help Card */}
          <div className="rounded-xl border border-line bg-white p-6 shadow-sm space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted">
              Instruções de Preenchimento
            </h3>
            <ul className="text-xs text-muted space-y-2 list-disc list-inside">
              <li>
                Campos marcados com <span className="text-red-500 font-bold">*</span> são de preenchimento obrigatório.
              </li>
              <li>
                Se o atendimento for <strong>Particular</strong>, a aba de planos e dados da carteirinha serão desativadas automaticamente.
              </li>
              <li>
                A reordenação de profissionais é automática ao selecionar ou alterar a especialidade.
              </li>
              <li>
                Ao salvar e imprimir, a ficha de atendimento administrativo será enviada à fila de impressão do sistema.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Documentos do atendimento (ficha + termos de consentimento) */}
      {docsModal && (
        <DocumentosAtendimentoModal
          aberto={docsModal !== null}
          onClose={fecharDocs}
          item={item}
          dados={docsModal}
          clinica={clinica}
          termosAtivos={termosAtivos}
          patientId={item.patientId}
        />
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  className = "",
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <label className={`flex items-center justify-between gap-2 ${className}`}>
      <span className="text-sm text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 flex-none rounded-full transition-colors ${
          checked ? "bg-brand-500" : "bg-line"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}
