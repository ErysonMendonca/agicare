"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Printer, Stethoscope, HeartPulse, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { cn } from "@/lib/utils";
import { DocumentActions } from "@/components/clinico/DocumentActions";
import { CancelarDocumentoModal } from "@/components/clinico/CancelarDocumentoModal";
import { type EvolucaoCard } from "@/lib/data/evolucao";
import { registrarEvolucao, editarEvolucao } from "@/lib/actions/evolucao";
import { cancelarDocumento } from "@/lib/actions/documento-cancelamento";
import {
  abrirImpressao,
  corpoTexto,
  esc,
  identPacienteHTML,
  limpo,
  montarDocumentoBase,
  rodapeAssinaturaProfissional,
  type ClinicaImpressao,
} from "@/lib/clinico/documento-impressao";

type PacienteIdent = {
  nome: string;
  registro: string;
  idade: string;
  convenio: string;
};

/** Extrai o valor de um campo rotulado do conteúdo formatado da evolução. */
function extrairCampo(conteudo: string, label: string): string {
  const bloco = conteudo
    .split("\n\n")
    .find((b) => b.trimStart().startsWith(`${label}:`));
  if (!bloco) return "";
  return bloco.slice(bloco.indexOf(":") + 1).trim();
}

type TextosEvolucao = Record<TextoKey, string>;

/** Reconstrói os 5 campos a partir do conteúdo salvo (para editar). */
function parseConteudo(conteudo: string): TextosEvolucao {
  return {
    queixa: extrairCampo(conteudo, "Queixa Principal"),
    hda: extrairCampo(conteudo, "História da Doença Atual (HDA)"),
    exame: extrairCampo(conteudo, "Exame Físico"),
    hipotese: extrairCampo(conteudo, "Hipótese Diagnóstica"),
    conduta: extrairCampo(conteudo, "Conduta / Plano"),
  };
}

/** Data/hora local no formato aceito por <input type="datetime-local">. */
function agoraLocal(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

const TEXTOS = [
  ["queixa", "Queixa Principal", "Motivo principal do atendimento..."],
  ["hda", "História da Doença Atual (HDA)", "Evolução do quadro..."],
  ["exame", "Exame Físico", "Achados do exame..."],
  ["hipotese", "Hipótese Diagnóstica", "Hipóteses consideradas..."],
  ["conduta", "Conduta / Plano", "Condutas, prescrições, encaminhamentos..."],
] as const;

type TextoKey = (typeof TEXTOS)[number][0];

export function EvolucaoClient({
  patientId,
  clinica,
  paciente,
  evolucoes,
}: {
  patientId: string;
  clinica: ClinicaImpressao;
  paciente: PacienteIdent;
  evolucoes: EvolucaoCard[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(false);
  const [ver, setVer] = useState<EvolucaoCard | null>(null);
  const [cancelar, setCancelar] = useState<EvolucaoCard | null>(null);
  const [editar, setEditar] = useState<EvolucaoCard | null>(null);
  const [editTextos, setEditTextos] = useState<TextosEvolucao>({
    queixa: "",
    hda: "",
    exame: "",
    hipotese: "",
    conduta: "",
  });

  function abrirEdicao(e: EvolucaoCard) {
    setEditar(e);
    setEditTextos(parseConteudo(e.conteudo));
  }

  function salvarEdicao() {
    if (!editar) return;
    const alvo = editar;
    startTransition(async () => {
      const res = await editarEvolucao({
        id: alvo.id,
        patientId,
        ...editTextos,
      });
      if (res?.ok) {
        toast.success("Evolução atualizada.");
        setEditar(null);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível atualizar a evolução.");
      }
    });
  }

  /** Imprime uma evolução como documento próprio no modelo padrão. */
  function imprimirEvolucao(e: EvolucaoCard) {
    const ident = identPacienteHTML(paciente.nome, [
      { lbl: "Registro", val: limpo(paciente.registro) || "—" },
      { lbl: "Idade", val: limpo(paciente.idade) || "—" },
      { lbl: "Convênio", val: limpo(paciente.convenio) || "—" },
      { lbl: "Data/hora", val: limpo(e.dataHora) || "—" },
    ]);

    const extras =
      e.extras.length > 0
        ? `<div class="extras"><div class="corpo-lbl">Outros sinais</div>${e.extras
            .map((x) => `<span class="ex"><b>${esc(x.label)}:</b> ${esc(x.value)}</span>`)
            .join("")}</div>`
        : "";

    const corpo = `<div class="texto">${corpoTexto(e.conteudo)}</div>${extras}`;

    const html = montarDocumentoBase({
      titulo: "EVOLUÇÃO CLÍNICA",
      clinica,
      pacienteNome: paciente.nome,
      identHTML: ident,
      corpoHTML: corpo,
      rodapeHTML: rodapeAssinaturaProfissional(
        limpo(e.profissional) || "Profissional responsável",
        "Assinatura e carimbo (CRM)",
      ),
      cssExtra: `
        .corpo { min-height: 260px; }
        .corpo .texto { font-size: 13px; }
        .corpo .extras { margin-top: 14px; border-top: 1px solid #ccc; padding-top: 8px; }
        .corpo .ex { display: inline-block; margin-right: 18px; font-size: 12px; }`,
    });

    abrirImpressao(html, "Permita pop-ups para imprimir a evolução.");
  }

  function confirmarCancelamento(motivo: string) {
    if (!cancelar) return;
    const alvo = cancelar;
    startTransition(async () => {
      const res = await cancelarDocumento({
        tabela: "medical_records",
        id: alvo.id,
        motivo,
      });
      if (res?.ok) {
        toast.success("Evolução cancelada.");
        setCancelar(null);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível cancelar a evolução.");
      }
    });
  }

  const [dataHora, setDataHora] = useState(agoraLocal());
  const [vitais, setVitais] = useState({
    paSistolica: "",
    paDiastolica: "",
    fc: "",
    temp: "",
    spo2: "",
  });
  const [extras, setExtras] = useState<Array<{ label: string; value: string }>>(
    [],
  );
  const [textos, setTextos] = useState<Record<TextoKey, string>>({
    queixa: "",
    hda: "",
    exame: "",
    hipotese: "",
    conduta: "",
  });

  function reset() {
    setDataHora(agoraLocal());
    setVitais({ paSistolica: "", paDiastolica: "", fc: "", temp: "", spo2: "" });
    setExtras([]);
    setTextos({ queixa: "", hda: "", exame: "", hipotese: "", conduta: "" });
  }

  function salvar() {
    startTransition(async () => {
      const res = await registrarEvolucao({
        patientId,
        dataHora,
        ...vitais,
        ...textos,
        extras,
      });
      if (res?.ok) {
        toast.success("Evolução registrada.");
        setForm(false);
        reset();
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível registrar a evolução.");
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setForm(true)}>
          <Plus className="h-4 w-4" /> Nova Evolução
        </Button>
      </div>

      {evolucoes.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-5 py-16 text-center">
          <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted-surface text-muted">
            <Stethoscope className="h-7 w-7" />
          </span>
          <p className="font-medium text-ink">Nenhuma evolução registrada</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            Registre a primeira evolução clínica deste atendimento.
          </p>
        </Card>
      ) : (
        <Stagger className="flex flex-col gap-3">
          {evolucoes.map((e) => (
            <FadeInUp key={e.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Stethoscope className="h-5 w-5" />
                    </span>
                    <div
                      className={cn(
                        e.cancelledAt !== null &&
                          "text-status-danger [&_*]:text-status-danger",
                      )}
                    >
                      <p className="font-medium text-ink">{e.profissional}</p>
                      <p className="text-xs text-muted">{e.dataHora}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-muted">{e.resumo}</p>
                    </div>
                  </div>
                  <DocumentActions
                    cancelled={e.cancelledAt !== null}
                    cancelReason={e.cancelReason}
                    pending={pending}
                    onView={() => setVer(e)}
                    onEdit={() => abrirEdicao(e)}
                    onPrint={() => imprimirEvolucao(e)}
                    onCancel={() => setCancelar(e)}
                  />
                </div>
              </Card>
            </FadeInUp>
          ))}
        </Stagger>
      )}

      {/* Modal de cadastro */}
      <Modal
        open={form}
        onClose={() => setForm(false)}
        title="Nova Evolução Clínica"
        subtitle="Data/hora permite retroação. Sinais vitais são opcionais."
        className="max-w-2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pending}>
              {pending ? "Salvando…" : "Salvar Evolução"}
            </Button>
          </>
        }
      >
        <Input
          type="datetime-local"
          label="Data e Hora do atendimento"
          value={dataHora}
          onChange={(e) => setDataHora(e.target.value)}
        />

        <fieldset className="mt-5 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-muted">
            <span className="inline-flex items-center gap-1.5">
              <HeartPulse className="h-4 w-4 text-red-500" /> Sinais Vitais
            </span>
          </legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Input
              label="PA Sistólica (mmHg)"
              type="number"
              inputMode="numeric"
              value={vitais.paSistolica}
              onChange={(e) => setVitais((v) => ({ ...v, paSistolica: e.target.value }))}
            />
            <Input
              label="PA Diastólica (mmHg)"
              type="number"
              inputMode="numeric"
              value={vitais.paDiastolica}
              onChange={(e) => setVitais((v) => ({ ...v, paDiastolica: e.target.value }))}
            />
            <Input
              label="FC (bpm)"
              type="number"
              inputMode="numeric"
              value={vitais.fc}
              onChange={(e) => setVitais((v) => ({ ...v, fc: e.target.value }))}
            />
            <Input
              label="Temp (°C)"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={vitais.temp}
              onChange={(e) => setVitais((v) => ({ ...v, temp: e.target.value }))}
            />
            <Input
              label="SpO₂ (%)"
              type="number"
              inputMode="numeric"
              value={vitais.spo2}
              onChange={(e) => setVitais((v) => ({ ...v, spo2: e.target.value }))}
            />
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <p className="text-xs font-medium text-muted">
              Outros sinais (opcional)
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Itens extras, ex.: sinais vitais do bebê (perímetro cefálico).
            </p>
            {extras.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {extras.map((item, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <Input
                      label={i === 0 ? "Rótulo" : undefined}
                      placeholder="Ex.: Perímetro cefálico"
                      value={item.label}
                      onChange={(e) =>
                        setExtras((arr) =>
                          arr.map((x, j) =>
                            j === i ? { ...x, label: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Input
                      label={i === 0 ? "Valor" : undefined}
                      placeholder="Ex.: 34 cm"
                      value={item.value}
                      onChange={(e) =>
                        setExtras((arr) =>
                          arr.map((x, j) =>
                            j === i ? { ...x, value: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label="Remover item"
                      onClick={() =>
                        setExtras((arr) => arr.filter((_, j) => j !== i))
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() =>
                setExtras((arr) => [...arr, { label: "", value: "" }])
              }
            >
              <Plus className="h-4 w-4" /> Adicionar item
            </Button>
          </div>
        </fieldset>

        <div className="mt-5 space-y-4">
          {TEXTOS.map(([key, label, placeholder]) => (
            <label key={key} className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {label} <span className="text-red-500">*</span>
              </span>
              <textarea
                rows={3}
                placeholder={placeholder}
                value={textos[key]}
                onChange={(e) => setTextos((t) => ({ ...t, [key]: e.target.value }))}
                className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>
          ))}
        </div>
      </Modal>

      {/* Modal Ver / Imprimir */}
      <Modal
        open={ver !== null}
        onClose={() => setVer(null)}
        title="Evolução Clínica"
        subtitle={ver ? `${ver.profissional} · ${ver.dataHora}` : undefined}
        className="max-w-2xl"
        footer={
          <Button
            variant="outline"
            onClick={() => ver && imprimirEvolucao(ver)}
          >
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
        }
      >
        <pre className="whitespace-pre-wrap font-sans text-sm text-ink">
          {ver?.conteudo}
        </pre>
        {ver && ver.extras.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-2 text-xs font-semibold text-muted">
              Outros sinais
            </p>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {ver.extras.map((x, i) => (
                <div key={i} className="flex gap-1.5">
                  <dt className="text-muted">{x.label}:</dt>
                  <dd className="font-medium text-ink">{x.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Modal>

      {/* Modal de edição do texto */}
      <Modal
        open={editar !== null}
        onClose={() => setEditar(null)}
        title="Editar Evolução Clínica"
        subtitle={
          editar ? `${editar.profissional} · ${editar.dataHora}` : undefined
        }
        className="max-w-2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditar(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarEdicao} disabled={pending}>
              {pending ? "Salvando…" : "Salvar Alterações"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {TEXTOS.map(([key, label, placeholder]) => (
            <label key={key} className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {label} <span className="text-red-500">*</span>
              </span>
              <textarea
                rows={3}
                placeholder={placeholder}
                value={editTextos[key]}
                onChange={(ev) =>
                  setEditTextos((t) => ({ ...t, [key]: ev.target.value }))
                }
                className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>
          ))}
        </div>
      </Modal>

      {/* Modal de cancelamento (não destrutivo) */}
      <CancelarDocumentoModal
        open={cancelar !== null}
        onClose={() => setCancelar(null)}
        onConfirm={confirmarCancelamento}
        pending={pending}
        titulo="Cancelar evolução"
      />
    </>
  );
}
