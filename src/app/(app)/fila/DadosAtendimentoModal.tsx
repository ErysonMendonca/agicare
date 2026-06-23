"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Save, Printer, AlertTriangle } from "lucide-react";
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
}: {
  item: FilaItem;
  open: boolean;
  onClose: () => void;
  onVoltar: () => void;
  /** Opções parametrizáveis (de fila/page.tsx → FilaClient). Fallback se vazio. */
  options?: AttendanceOptionsByCategory;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [convenio, setConvenio] = useState<string>(
    () => item.convenio || resolveOptions(options, "convenio")[0]?.value || "",
  );
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
  const draftKey = `draft:atendimento:${item.id}`;

  // Listas de opções (parametrizadas ou fallback) — value = grava o selecionado.
  const oOrigem = resolveOptions(options, "origem");
  const oMedico = resolveOptions(options, "medico");
  const oEspec = resolveOptions(options, "especialidade");
  const oEncam = resolveOptions(options, "encaminhamento");
  const oCarater = resolveOptions(options, "carater");
  const oProced = resolveOptions(options, "procedencia");
  const oCentro = resolveOptions(options, "centro_custo");
  const oConv = resolveOptions(options, "convenio");
  const oPlano = resolveOptions(options, "plano");
  const oParent = resolveOptions(options, "parentesco");

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
    if (imprimir) window.print();
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

            {/* Linha 2: profissional / especialidade / encaminhamento / etc. */}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                name="medico"
                label="Profissional"
                defaultValue={oMedico[0]?.value}
              >
                {oMedico.map((o) => (
                  <option key={o.id} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <Select
                name="especialidade"
                label="Especialidade"
                defaultValue={oEspec[0]?.value}
              >
                {oEspec.map((o) => (
                  <option key={o.id} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <Select
                name="encaminhamento"
                label="Encaminhamento de Atendimento"
                defaultValue={oEncam[0]?.value}
              >
                {oEncam.map((o) => (
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Nome</span>
                <div className="flex gap-2">
                  <Input
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
