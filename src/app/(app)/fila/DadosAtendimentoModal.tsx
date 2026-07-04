"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronLeft, Save, Printer, AlertTriangle } from "lucide-react";
import { FichaAtendimento, type DadosAtendimentoDoc } from "./FichaAtendimento";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { salvarAtendimento } from "@/lib/actions/queue";
import { type FilaItem } from "@/lib/data/queue";
import type {
  AttendanceOption,
  AttendanceOptionsByCategory,
} from "@/lib/data/attendance-options";

// ════════════════════════════════════════════════════════════════
// Opções fixas (réplica do sistema de referência) — usadas como FALLBACK
// quando a clínica ainda não parametrizou as opções em /configuracoes.
// ════════════════════════════════════════════════════════════════
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

/** Resolve as opções de uma categoria, caindo no fallback quando vazio. */
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

/** Normaliza texto p/ comparação (sem acento, minúsculo, sem prefixo "N - "). */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^\s*\d+\s*-\s*/, "") // remove "2 - " de "2 - CARDIOLOGIA"
    .trim();
}

/**
 * O valor do AGENDAMENTO manda (especialidade/profissional/tipo). Se casar com uma
 * opção configurada, usa o value dela; se NÃO estiver na lista, injeta o valor
 * do agendamento como opção e pré-seleciona (assim especialidade/profissional
 * sempre refletem o agendamento). Sem valor no agendamento → 1º item.
 */
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

export function DadosAtendimentoModal({
  item,
  open,
  onClose,
  onVoltar,
  options,
  profissionais = [],
}: {
  item: FilaItem;
  open: boolean;
  onClose: () => void;
  onVoltar: () => void;
  /** Opções parametrizáveis (de fila/page.tsx → FilaClient). Fallback se vazio. */
  options?: AttendanceOptionsByCategory;
  /** Profissionais reais vinculados às especialidades (de fila/page.tsx). */
  profissionais?: {
    id: string;
    nome: string;
    especialidade: string;
    ativo: boolean;
  }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [convenio, setConvenio] = useState<string>(() => {
    // Convênio vem do CADASTRO do paciente (patients.convenio); se ausente, cai
    // no convênio do atendimento e, por fim, no 1º da lista. "—" é placeholder.
    const limpo = (v: string | null | undefined) =>
      v && v !== "—" ? v : "";
    const doCadastro = limpo(item.convenioCadastro);
    const doItem = limpo(item.convenio);
    return (
      doCadastro || doItem || resolveOptions(options, "convenio")[0]?.value || ""
    );
  });
  const [plano, setPlano] = useState("");
  // "Particular" não tem convênio → não exige plano nem dados de carteirinha.
  const isParticular = /particular/i.test(convenio);
  const [oMesmo, setOMesmo] = useState(false);
  const [respNome, setRespNome] = useState("");
  const [gestante, setGestante] = useState(false);
  const [pending, setPending] = useState(false);

  // Não-perder-ao-fechar: dirty + diálogo de confirmação + rascunho local.
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // v2: invalida rascunhos pré-"Tipo de Atendimento" (que guardavam o antigo
  // default de encaminhamento e sobrescreveriam o autofill do agendamento).
  const draftKey = `draft:atendimento:v2:${item.id}`;

  // Listas de opções (parametrizadas ou fallback) — value = grava o selecionado.
  const oOrigem = resolveOptions(options, "origem");
  const oMedico = resolveOptions(options, "medico");
  const oEspec = resolveOptions(options, "especialidade");
  const oEncam = resolveOptions(options, "encaminhamento");
  // ── Tipo de Atendimento (ex-"Encaminhamento") ──────────────────────────────
  // Autopreenche com o que foi escolhido no AGENDAMENTO (service_type:
  // Consulta/Retorno/Exame/Procedimento). O valor do agendamento MANDA: se não
  // estiver na lista configurada da clínica, é injetado como opção e pré-selecionado.
  // Sem agendamento (avulso), abre em "Selecione" e a seleção vira obrigatória.
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
  const oCarater = resolveOptions(options, "carater");
  const oProced = resolveOptions(options, "procedencia");
  const oCentro = resolveOptions(options, "centro_custo");
  const oConv = resolveOptions(options, "convenio");
  const oPlano = resolveOptions(options, "plano");
  const oParent = resolveOptions(options, "parentesco");

  // Especialidade vem do AGENDAMENTO (injeta se fora da lista); é CONTROLADA
  // para que o Profissional possa reagir à especialidade escolhida.
  const espec = comAgendamento(oEspec, item.especialidade);
  const prof = comAgendamento(oMedico, item.medico);
  const [especSel, setEspecSel] = useState(espec.value);

  /**
   * Opções de Profissional derivadas dos PROFISSIONAIS REAIS vinculados à
   * especialidade selecionada. Preserva o profissional do AGENDAMENTO (injeta
   * como 1ª opção se não estiver na lista filtrada) para não perder o vínculo.
   */
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

  /**
   * Troca a especialidade e, se o profissional atual não pertencer mais à nova
   * especialidade, ajusta para a 1ª opção disponível (ou "" se nenhuma). Feito
   * no handler (não em useEffect) para evitar renders em cascata.
   */
  function trocarEspecialidade(nova: string) {
    setEspecSel(nova);
    const opts = profOptionsFor(nova);
    if (!opts.some((o) => o.value === profSel)) {
      setProfSel(opts[0]?.value ?? "");
    }
    markDirty();
  }

  /** Snapshot completo do formulário (campos + estados controlados). */
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
      /* localStorage indisponível — ignora silenciosamente */
    }
  }, [draftKey, snapshot]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }, [draftKey]);

  // Restaura o rascunho ao (re)abrir o modal deste paciente.
  useEffect(() => {
    if (!open) return;
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
      // Aplica o rascunho após o paint inicial (fora do corpo do efeito, p/
      // evitar setState síncrono — restaura controlados + campos do DOM).
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
      /* rascunho corrompido — ignora */
    }
    // Só queremos rodar quando o modal abre para este paciente.
  }, [open, draftKey]);

  // Persiste mudanças dos estados controlados enquanto sujo.
  useEffect(() => {
    if (!open || !dirty) return;
    persist();
  }, [open, dirty, convenio, plano, gestante, oMesmo, respNome, persist]);

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

  /** Lê os campos não-controlados do form (defaultValue) por `name`. */
  function readForm(name: string): string {
    const v = formRef.current ? new FormData(formRef.current).get(name) : null;
    return typeof v === "string" ? v : "";
  }

  /** Mapeia o valor do caráter → enum do banco. */
  function mapCarater(value: string): "urgencia" | "eletivo" | undefined {
    if (!value) return undefined;
    return /urg/i.test(value) ? "urgencia" : "eletivo";
  }

  /** Monta o documento do detalhe do atendimento a partir dos valores atuais. */
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
      // "O MESMO": responsável é o próprio paciente → omite a seção Responsável
      // no documento (não repete o nome do paciente).
      responsavel: oMesmo ? "" : respNome,
      respDocumento: oMesmo ? "" : readForm("resp_documento"),
      respParentesco: oMesmo ? "" : readForm("resp_parentesco"),
      observacoes: readForm("observacoes"),
    };
  }

  // Documento de impressão renderizado (oculto na tela). `flushSync` garante que
  // ele esteja no DOM antes de `window.print()`.
  const [docImpressao, setDocImpressao] = useState<DadosAtendimentoDoc | null>(
    null,
  );
  function imprimirDocumento() {
    flushSync(() => setDocImpressao(montarDoc()));
    window.print();
    // Limpa o documento após imprimir (evita Ctrl+P depois com dado desatualizado).
    setDocImpressao(null);
  }

  /** Fecha pedindo confirmação se houver alterações não salvas. */
  const handleClose = useCallback(() => {
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }, [dirty, onClose]);

  function descartarEFechar() {
    clearDraft();
    setDirty(false);
    setConfirmClose(false);
    onClose();
  }

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

    setPending(true);
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
    setPending(false);

    if (res?.error) {
      toast.error(res.error);
      return;
    }
    // Salvou com sucesso → limpa o rascunho e zera o "dirty".
    clearDraft();
    setDirty(false);
    toast.success(
      imprimir ? "Atendimento salvo. Gerando impressão…" : "Atendimento salvo.",
    );
    if (imprimir) imprimirDocumento();
    // Reflete na fila o avanço do status (recepção concluída → aguardando atendimento).
    router.refresh();
    onClose();
  }

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        title={`Dados de Atendimento - ${item.paciente}`}
        className="max-w-5xl"
        footer={
          <>
            <Button
              variant="outline"
              onClick={onVoltar}
              className="mr-auto"
              disabled={pending}
            >
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </Button>
            <Button
              variant="outline"
              onClick={imprimirDocumento}
              disabled={pending}
            >
              <Printer className="h-4 w-4" />
              Reimprimir
            </Button>
            <Button variant="primary" onClick={() => salvar(false)} disabled={pending}>
              <Save className="h-4 w-4" />
              Salvar
            </Button>
            <Button variant="primary" onClick={() => salvar(true)} disabled={pending}>
              <Printer className="h-4 w-4" />
              Salvar e Imprimir
            </Button>
          </>
        }
      >
        <form
          ref={formRef}
          onSubmit={(e) => e.preventDefault()}
          onInput={markDirty}
        >
          {/* Dados do Atendimento */}
          <fieldset className="rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-muted">
              Dados do Atendimento
            </legend>

            {/* Linha 1: identificação + entrada + gestante */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="mb-1.5 block text-sm font-medium text-ink">
                  Registro
                </span>
                <span className="inline-flex h-10 w-full items-center rounded-lg bg-brand-50 px-3 text-sm font-semibold text-brand-600">
                  AUTO
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
            </div>

            {/* Linha 2: especialidade / profissional / tipo / etc. (especialidade
                e profissional vêm do agendamento). */}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                name="especialidade"
                label="Especialidade"
                value={especSel}
                onChange={(e) => trocarEspecialidade(e.target.value)}
              >
                {espec.options.map((o) => (
                  <option key={o.id} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <Select
                name="medico"
                label="Profissional"
                value={profSel}
                onChange={(e) => {
                  setProfSel(e.target.value);
                  markDirty();
                }}
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
              <Select
                name="encaminhamento"
                label="Tipo de Atendimento *"
                defaultValue={tipoDefault}
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
          </fieldset>

          {/* Dados do Convênio */}
          <fieldset className="mt-5 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-muted">
              Dados do Convênio
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Select
                name="convenio"
                label="Convênio *"
                value={convenio}
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
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-sm font-medium text-ink">
                  Validador de Convênio
                </span>
                <Input
                  name="validador"
                  placeholder="Código do validador"
                  disabled={isParticular}
                />
                <span className="mt-1 block text-xs text-muted">
                  {isParticular
                    ? "Atendimento particular — sem dados de convênio."
                    : "Digite o código do validador fornecido pelo convênio"}
                </span>
              </label>
            </div>
          </fieldset>

          {/* Responsável */}
          <fieldset className="mt-5 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-muted">Responsável</legend>
            {/* Nome ocupa a linha inteira (input largo p/ digitar o nome completo). */}
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
                  className={`h-10 flex-none rounded-lg px-3 text-sm font-semibold transition-colors ${
                    oMesmo
                      ? "bg-brand-500 text-white"
                      : "border border-line text-ink hover:bg-muted-surface"
                  }`}
                >
                  O MESMO
                </button>
              </div>
            </label>
            {/* Documento e Grau de Parentesco só quando o responsável NÃO é o
                próprio paciente. Com "O MESMO", esses campos não fazem sentido. */}
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
          </fieldset>

          {/* Observação */}
          <label htmlFor="obs-atendimento" className="mt-5 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Observação</span>
            <textarea
              id="obs-atendimento"
              name="observacoes"
              rows={3}
              placeholder="Observações sobre o atendimento..."
              className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </form>

        {/* Documento do detalhe do atendimento — oculto na tela, visível só na
            impressão (Reimprimir / Salvar e Imprimir). */}
        {docImpressao && <FichaAtendimento item={item} dados={docImpressao} />}
      </Modal>

      {/* Confirmação ao fechar com alterações não salvas (não-perder). */}
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Descartar alterações?"
        className="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmClose(false)}>
              Continuar atendimento
            </Button>
            <Button variant="danger" onClick={descartarEFechar}>
              Descartar
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <p className="text-sm text-muted">
            Você tem alterações não salvas neste atendimento. Um rascunho foi
            guardado neste navegador e será restaurado ao reabrir. Deseja
            continuar preenchendo ou descartar e fechar?
          </p>
        </div>
      </Modal>
    </>
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
