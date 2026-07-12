"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  AlertTriangle,
  TriangleAlert,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { DocumentActions } from "@/components/clinico/DocumentActions";
import { CancelarDocumentoModal } from "@/components/clinico/CancelarDocumentoModal";
import {
  chaveEspecialidade,
  ESPECIALIDADES_ANAMNESE,
} from "@/lib/clinico/anamnese-config";
import {
  type AnamneseField,
  type AnamneseTemplate,
} from "@/lib/data/anamnese-templates.shared";
import { type AnamneseRegistro } from "@/lib/data/anamnese";
import {
  gerarAnamnese,
  editarAnamnese,
} from "@/lib/actions/anamnese";
import { cancelarDocumento } from "@/lib/actions/documento-cancelamento";

type BlocoCampos = { titulo: string; campos: AnamneseField[] };

/** Agrupa campos por seção preservando a ordem (usado no form e na edição). */
function agruparCampos(campos: AnamneseField[]): BlocoCampos[] {
  const grupos: BlocoCampos[] = [];
  const indice = new Map<string, number>();
  for (const campo of campos) {
    const titulo = campo.section?.trim() || "Anamnese";
    let i = indice.get(titulo);
    if (i === undefined) {
      i = grupos.length;
      indice.set(titulo, i);
      grupos.push({ titulo, campos: [] });
    }
    grupos[i].campos.push(campo);
  }
  return grupos;
}

const textareaCls =
  "w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function AnamneseClient({
  patientId,
  anamneses,
  minhaEspecialidade,
  templates,
}: {
  patientId: string;
  anamneses: AnamneseRegistro[];
  minhaEspecialidade: string | null;
  templates: AnamneseTemplate[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ver, setVer] = useState<AnamneseRegistro | null>(null);

  const especialidadeInicial = useMemo(() => {
    const chave = chaveEspecialidade(minhaEspecialidade);
    const match = ESPECIALIDADES_ANAMNESE.find(
      (e) => chaveEspecialidade(e.value) === chave,
    );
    return match?.value ?? "Geral";
  }, [minhaEspecialidade]);

  const [specialty, setSpecialty] = useState<string>(especialidadeInicial);
  const [values, setValues] = useState<Record<string, unknown>>({});

  // Mapa especialidade → campos (vem do template salvo no banco ou do fallback).
  const fieldsBySpecialty = useMemo(() => {
    const m = new Map<string, AnamneseField[]>();
    for (const t of templates) m.set(t.specialty, t.fields);
    return m;
  }, [templates]);

  // Agrupa os campos da especialidade selecionada por seção (preserva a ordem).
  const blocos = useMemo(
    () => agruparCampos(fieldsBySpecialty.get(specialty) ?? []),
    [fieldsBySpecialty, specialty],
  );

  // Edição de uma anamnese existente.
  const [editar, setEditar] = useState<AnamneseRegistro | null>(null);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const [cancelar, setCancelar] = useState<AnamneseRegistro | null>(null);

  const editBlocos = useMemo(
    () =>
      editar ? agruparCampos(fieldsBySpecialty.get(editar.specialty) ?? []) : [],
    [editar, fieldsBySpecialty],
  );

  function abrirEdicao(a: AnamneseRegistro) {
    setEditar(a);
    setEditValues({ ...a.campos });
  }

  function salvarEdicao() {
    if (!editar) return;
    const alvo = editar;
    startTransition(async () => {
      const res = await editarAnamnese({
        id: alvo.id,
        patientId,
        specialty: alvo.specialty,
        fields: editValues,
      });
      if (res?.ok) {
        toast.success("Anamnese atualizada.");
        setEditar(null);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível atualizar a anamnese.");
      }
    });
  }

  function confirmarCancelamento(motivo: string) {
    if (!cancelar) return;
    const alvo = cancelar;
    startTransition(async () => {
      const res = await cancelarDocumento({
        tabela: "anamneses",
        id: alvo.id,
        motivo,
      });
      if (res?.ok) {
        toast.success("Anamnese cancelada.");
        setCancelar(null);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível cancelar a anamnese.");
      }
    });
  }

  function imprimirAnamnese(a: AnamneseRegistro) {
    const linhas = Object.entries(a.campos)
      .map(
        ([key, val]) =>
          `<div class="campo"><span class="k">${escapeHtml(key)}</span><span class="v">${escapeHtml(
            formatarValor(val),
          )}</span></div>`,
      )
      .join("");
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Anamnese — ${escapeHtml(
      a.specialty,
    )}</title><style>
      body{font-family:system-ui,Arial,sans-serif;color:#1a1a1a;padding:32px;max-width:720px;margin:0 auto}
      h1{font-size:18px;margin:0 0 4px}
      .meta{color:#666;font-size:13px;margin-bottom:20px}
      .campo{border-bottom:1px solid #e5e5e5;padding:8px 0}
      .k{display:block;text-transform:uppercase;font-size:11px;color:#888}
      .v{display:block;font-size:14px}
      @media print{body{padding:0}}
    </style></head><body>
      <h1>Anamnese — ${escapeHtml(a.specialty)}</h1>
      <div class="meta">${escapeHtml(a.profissional)} · ${escapeHtml(a.dataHora)} · Atendimento nº ${escapeHtml(
        a.atendimentoCodigo ?? "—",
      )}</div>
      ${linhas}
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  // Regra: só gera quem é da especialidade da ficha (em demo, minha = null → liberado).
  const podeGerar =
    minhaEspecialidade == null ||
    chaveEspecialidade(minhaEspecialidade) === chaveEspecialidade(specialty);

  const getStr = (key: string) =>
    typeof values[key] === "string" ? (values[key] as string) : "";
  const getArr = (key: string) =>
    Array.isArray(values[key]) ? (values[key] as string[]) : [];
  const getBool = (key: string) => values[key] === true;
  const setValue = (key: string, val: unknown) =>
    setValues((v) => ({ ...v, [key]: val }));
  const toggleOpcao = (key: string, opt: string) => {
    const atual = getArr(key);
    setValue(key, atual.includes(opt) ? atual.filter((o) => o !== opt) : [...atual, opt]);
  };

  function reset() {
    setValues({});
    setSpecialty(especialidadeInicial);
  }

  function gerar() {
    startTransition(async () => {
      const res = await gerarAnamnese({
        patientId,
        specialty,
        fields: values,
      });
      if (res?.ok) {
        toast.success("Anamnese gerada.");
        reset();
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível gerar a anamnese.");
      }
    });
  }

  return (
    <>
      {/* Formulário de Anamnese (Sempre visível para preenchimento) */}
      <Card className="mb-6 border-brand-200 bg-brand-50/40 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-semibold text-ink">Nova Anamnese</h3>
              <p className="text-xs text-muted">Preencha a ficha modelo para o paciente.</p>
            </div>
          </div>
          <div className="w-64">
            <Select
              aria-label="Especialidade"
              value={specialty}
              onChange={(e) => {
                setSpecialty(e.target.value);
                setValues({});
              }}
            >
              {ESPECIALIDADES_ANAMNESE.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {!podeGerar && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-600">
            <Lock className="mt-0.5 h-4 w-4 flex-none" />
            Sua especialidade ({minhaEspecialidade}) não corresponde à da ficha.
            Você pode visualizar, mas não gerar esta anamnese.
          </div>
        )}

        <div className="space-y-6">
          {blocos.map((bloco) => (
            <fieldset key={bloco.titulo} className="rounded-xl border border-line bg-white p-4">
              <legend className="px-1 text-sm font-semibold text-ink">
                {bloco.titulo}
              </legend>
              <div className="space-y-4">
                {bloco.campos.map((campo) => (
                  <CampoView
                    key={campo.id}
                    campo={campo}
                    valorTexto={getStr(campo.id)}
                    valorArray={getArr(campo.id)}
                    valorBool={getBool(campo.id)}
                    onTexto={(v) => setValue(campo.id, v)}
                    onToggle={(opt) => toggleOpcao(campo.id, opt)}
                    onBool={(v) => setValue(campo.id, v)}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={gerar} disabled={pending || !podeGerar}>
            {pending ? "Salvando…" : "Salvar Anamnese"}
          </Button>
        </div>
      </Card>

      <h3 className="mb-3 mt-8 font-semibold text-ink">Anamneses Anteriores</h3>
      {anamneses.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-5 py-10 text-center">
          <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted-surface text-muted">
            <ClipboardList className="h-5 w-5" />
          </span>
          <p className="font-medium text-ink">Nenhuma anamnese anterior</p>
        </Card>
      ) : (
        <Stagger className="flex flex-col gap-3">
          {anamneses.map((a) => (
            <FadeInUp key={a.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <ClipboardList className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink">{a.specialty}</p>
                      {a.campos?.podo_risco_pre_diabetico === true && (
                        <Badge status="danger">
                          <TriangleAlert className="h-3 w-3" /> Risco pré-diabético
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {a.profissional} · {a.dataHora}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-brand-600">
                      Atendimento nº {a.atendimentoCodigo ?? "—"}
                    </p>
                  </div>
                </div>
                <DocumentActions
                  cancelled={a.cancelledAt !== null}
                  cancelReason={a.cancelReason}
                  pending={pending}
                  onView={() => setVer(a)}
                  onEdit={() => abrirEdicao(a)}
                  onPrint={() => imprimirAnamnese(a)}
                  onCancel={() => setCancelar(a)}
                />
              </Card>
            </FadeInUp>
          ))}
        </Stagger>
      )}

      {/* Modal Ver */}
      <Modal
        open={ver !== null}
        onClose={() => setVer(null)}
        title={ver ? `Anamnese — ${ver.specialty}` : "Anamnese"}
        subtitle={
          ver
            ? `${ver.profissional} · ${ver.dataHora} · Atendimento nº ${ver.atendimentoCodigo ?? "—"}`
            : undefined
        }
        className="max-w-2xl"
      >
        {ver && (
          <div className="space-y-3 text-sm">
            {ver.campos?.podo_risco_pre_diabetico === true && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-600">
                <TriangleAlert className="h-4 w-4" /> Alerta: risco pré-diabético sinalizado.
              </div>
            )}
            {Object.entries(ver.campos).map(([key, val]) => (
              <div key={key} className="border-b border-line pb-2">
                <p className="text-xs uppercase text-muted">{key}</p>
                <p className="text-ink">{formatarValor(val)}</p>
              </div>
            ))}
            <div className="pt-2 text-xs text-muted">
              Consentimento LGPD: {ver.consentimento ? "registrado" : "não registrado"}
              {ver.assinatura && !isAssinaturaImagem(ver.assinatura)
                ? ` · Assinado por ${ver.assinatura}`
                : ""}
            </div>
            {ver.assinatura && isAssinaturaImagem(ver.assinatura) && (
              <div>
                <p className="mb-1.5 text-xs uppercase text-muted">Assinatura</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ver.assinatura}
                  alt="Assinatura digital do profissional"
                  className="max-h-32 rounded-lg border border-line bg-white"
                />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal Editar */}
      <Modal
        open={editar !== null}
        onClose={() => setEditar(null)}
        title={editar ? `Editar Anamnese — ${editar.specialty}` : "Editar Anamnese"}
        subtitle={editar ? `${editar.profissional} · ${editar.dataHora}` : undefined}
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
        {editar && (
          <div className="space-y-6">
            {editBlocos.length === 0 && (
              <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">
                Modelo desta especialidade indisponível para edição estruturada.
              </p>
            )}
            {editBlocos.map((bloco) => (
              <fieldset
                key={bloco.titulo}
                className="rounded-xl border border-line bg-white p-4"
              >
                <legend className="px-1 text-sm font-semibold text-ink">
                  {bloco.titulo}
                </legend>
                <div className="space-y-4">
                  {bloco.campos.map((campo) => {
                    const val = editValues[campo.id];
                    return (
                      <CampoView
                        key={campo.id}
                        campo={campo}
                        valorTexto={typeof val === "string" ? val : ""}
                        valorArray={Array.isArray(val) ? (val as string[]) : []}
                        valorBool={val === true}
                        onTexto={(v) =>
                          setEditValues((s) => ({ ...s, [campo.id]: v }))
                        }
                        onToggle={(opt) =>
                          setEditValues((s) => {
                            const atual = Array.isArray(s[campo.id])
                              ? (s[campo.id] as string[])
                              : [];
                            return {
                              ...s,
                              [campo.id]: atual.includes(opt)
                                ? atual.filter((o) => o !== opt)
                                : [...atual, opt],
                            };
                          })
                        }
                        onBool={(v) =>
                          setEditValues((s) => ({ ...s, [campo.id]: v }))
                        }
                      />
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        )}
      </Modal>

      {/* Modal Cancelar (não destrutivo) */}
      <CancelarDocumentoModal
        open={cancelar !== null}
        onClose={() => setCancelar(null)}
        onConfirm={confirmarCancelamento}
        pending={pending}
        titulo="Cancelar anamnese"
      />
    </>
  );
}

/** Escapa texto para injeção segura na janela de impressão. */
function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Distingue assinaturas novas (imagem base64) de registros legados (texto). */
function isAssinaturaImagem(valor: string): boolean {
  return valor.startsWith("data:image/");
}

function formatarValor(val: unknown): string {
  if (Array.isArray(val)) return val.length ? val.join(", ") : "—";
  if (typeof val === "boolean") return val ? "Sim" : "Não";
  if (val == null || val === "") return "—";
  return String(val);
}

function CampoView({
  campo,
  valorTexto,
  valorArray,
  valorBool,
  onTexto,
  onToggle,
  onBool,
}: {
  campo: AnamneseField;
  valorTexto: string;
  valorArray: string[];
  valorBool: boolean;
  onTexto: (v: string) => void;
  onToggle: (opt: string) => void;
  onBool: (v: boolean) => void;
}) {
  if (campo.tipo === "checkboxes") {
    return (
      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink">{campo.label}</span>
        <div className="flex flex-wrap gap-2">
          {(campo.options ?? []).map((opt) => {
            const ativo = valorArray.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onToggle(opt)}
                className={
                  ativo
                    ? "rounded-full bg-brand-500 px-3 py-1 text-xs font-medium text-white"
                    : "rounded-full border border-line px-3 py-1 text-xs font-medium text-muted hover:bg-muted-surface"
                }
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (campo.tipo === "select") {
    return (
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">{campo.label}</span>
        <select
          value={valorTexto}
          onChange={(e) => onTexto(e.target.value)}
          className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Selecione…</option>
          {(campo.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (campo.tipo === "textarea") {
    return (
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">{campo.label}</span>
        <textarea
          rows={2}
          value={valorTexto}
          placeholder={campo.placeholder}
          onChange={(e) => onTexto(e.target.value)}
          className={textareaCls}
        />
      </label>
    );
  }

  if (campo.tipo === "texto") {
    const amarelo = campo.destaque === "amarelo";
    return (
      <label className="block">
        <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
          {amarelo && <AlertTriangle className="h-4 w-4 text-orange-500" />}
          {campo.label}
        </span>
        <input
          value={valorTexto}
          placeholder={campo.placeholder}
          onChange={(e) => onTexto(e.target.value)}
          className={
            amarelo
              ? "h-10 w-full rounded-lg border border-orange-300 bg-orange-50 px-3 text-sm text-ink placeholder:text-orange-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              : "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          }
        />
      </label>
    );
  }

  // sim_nao
  const alertaVermelho = campo.alertaSim === "vermelho" && valorBool;
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{campo.label}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onBool(true)}
          className={
            valorBool
              ? "rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white"
              : "rounded-lg border border-line px-4 py-1.5 text-sm font-medium text-muted hover:bg-muted-surface"
          }
        >
          Sim
        </button>
        <button
          type="button"
          onClick={() => onBool(false)}
          className={
            !valorBool
              ? "rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white"
              : "rounded-lg border border-line px-4 py-1.5 text-sm font-medium text-muted hover:bg-muted-surface"
          }
        >
          Não
        </button>
      </div>
      {alertaVermelho && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-600">
          <TriangleAlert className="h-4 w-4 flex-none" />
          Atenção: condição de risco sinalizada — avaliar conduta com cautela.
        </div>
      )}
    </div>
  );
}
