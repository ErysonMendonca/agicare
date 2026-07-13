"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Check,
  Crown,
  Clock,
  AlertTriangle,
  Paperclip,
  Upload,
  X,
  FileScan,
  Image as ImageIcon,
  Radiation,
  Smile,
  File as FileIcon,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import {
  TIPOS_TRABALHO,
  TIPOS_ARQUIVO,
  rotuloKind,
  type KindArquivo,
  type PedidoProtetico,
} from "@/lib/clinico/protetico-shared";
import {
  criarPedidoProtetico,
  editarPedidoProtetico,
  registrarArquivoProtetico,
} from "@/lib/actions/protetico";
import { Odontograma } from "@/components/clinico/Odontograma";
import { DocumentActions } from "@/components/clinico/DocumentActions";
import { CancelarDocumentoModal } from "@/components/clinico/CancelarDocumentoModal";
import { cancelarDocumento } from "@/lib/actions/documento-cancelamento";
import {
  abrirImpressao,
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

type Anexo = { file: File; kind: KindArquivo };

const KIND_ICON: Record<string, typeof FileIcon> = {
  scan: FileScan,
  foto: ImageIcon,
  radiografia: Radiation,
  mordida: Smile,
};

function iconeKind(kind: string) {
  return KIND_ICON[kind] ?? FileIcon;
}

function fmtTamanho(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STEPS = ["Dados Básicos", "Especificações", "Anexos"] as const;

export function ProteticoClient({
  patientId,
  clinica,
  paciente,
  pedidos,
}: {
  patientId: string;
  clinica: ClinicaImpressao;
  paciente: PacienteIdent;
  pedidos: PedidoProtetico[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Etapa 1
  const [teeth, setTeeth] = useState("");
  const [workType, setWorkType] = useState("");
  const [urgent, setUrgent] = useState(false);
  // Etapa 2
  const [material, setMaterial] = useState("");
  const [color, setColor] = useState("");
  const [finishLine, setFinishLine] = useState("");
  const [occlusion, setOcclusion] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  // Etapa 3
  const [anexos, setAnexos] = useState<Anexo[]>([]);

  // Ações por pedido: visualizar (read-only), editar e cancelar.
  const [verPedido, setVerPedido] = useState<PedidoProtetico | null>(null);
  const [editar, setEditar] = useState<PedidoProtetico | null>(null);
  const [cancelar, setCancelar] = useState<PedidoProtetico | null>(null);

  function imprimirPedido(p: PedidoProtetico) {
    imprimirPedidoProtetico(clinica, paciente, p);
  }

  function confirmarCancelamento(motivo: string) {
    if (!cancelar) return;
    startTransition(async () => {
      const res = await cancelarDocumento({
        tabela: "prosthetic_orders",
        id: cancelar.id,
        motivo,
      });
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Pedido protético cancelado.");
      setCancelar(null);
      router.refresh();
    });
  }

  // O Scan/STL é obrigatório para concluir o pedido (5.5): o laboratório
  // trabalha sobre o modelo digital. Demais anexos seguem opcionais.
  const temScan = anexos.some((a) => a.kind === "scan");

  function reset() {
    setStep(0);
    setTeeth("");
    setWorkType("");
    setUrgent(false);
    setMaterial("");
    setColor("");
    setFinishLine("");
    setOcclusion("");
    setClinicalNotes("");
    setAnexos([]);
  }

  function fechar() {
    setOpen(false);
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const novos = Array.from(e.target.files ?? []).map<Anexo>((file) => ({
      file,
      kind: "scan",
    }));
    setAnexos((prev) => [...prev, ...novos]);
    // permite re-selecionar o mesmo arquivo depois
    e.target.value = "";
  }

  function removerAnexo(idx: number) {
    setAnexos((prev) => prev.filter((_, i) => i !== idx));
  }

  function setAnexoKind(idx: number, kind: KindArquivo) {
    setAnexos((prev) => prev.map((a, i) => (i === idx ? { ...a, kind } : a)));
  }

  const podeAvancar1 = teeth.trim().length > 0 && workType.length > 0;

  function avancar() {
    if (step === 0 && !podeAvancar1) {
      toast.error("Informe os dentes e o tipo de trabalho.");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  /**
   * Conclui o pedido: cria a ordem, faz upload dos anexos no bucket privado
   * 'protetico' (caminho `${patientId}/${orderId}/${file.name}`) e registra os
   * metadados. Em modo demo (sem Supabase), simula sucesso sem upload real.
   */
  function concluir() {
    // Bloqueio: sem Scan/STL não há como o laboratório executar o trabalho.
    if (!temScan) {
      toast.error(
        "Anexe ao menos um arquivo de Scan / STL para concluir o pedido.",
      );
      return;
    }
    startTransition(async () => {
      const res = await criarPedidoProtetico({
        patientId,
        teeth,
        workType,
        urgent,
        material,
        color,
        finishLine,
        occlusion,
        clinicalNotes,
      });

      if (!res?.ok || !res.orderId) {
        toast.error(res?.error ?? "Não foi possível criar o pedido protético.");
        return;
      }
      const orderId = res.orderId;
      // clinic_id da clínica ativa (vem do servidor). O path DEVE começar pela
      // clínica para casar com a policy de Storage da 0021:
      // protetico/<clinic_id>/<patient_id>/<order_id>/<arquivo>.
      const clinicId = res.clinicId;

      // Modo demo: não há Storage real configurado — simula sucesso.
      if (!isSupabaseConfigured()) {
        if (anexos.length > 0) {
          toast.success(
            `Pedido criado. ${anexos.length} anexo(s) simulado(s) no modo demonstração.`,
          );
        } else {
          toast.success("Pedido protético criado.");
        }
        setOpen(false);
        reset();
        router.refresh();
        return;
      }

      // Produção: upload binário no browser + registro dos metadados.
      const supabase = createClient();
      let enviados = 0;
      let falhas = 0;

      for (const { file, kind } of anexos) {
        // Prefixo da clínica exigido pela RLS de Storage (0021). Sem ele o
        // upload é rejeitado / o arquivo fica invisível.
        const path = clinicId
          ? `${clinicId}/${patientId}/${orderId}/${file.name}`
          : `${patientId}/${orderId}/${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("protetico")
          .upload(path, file, { upsert: false });

        if (upErr) {
          falhas++;
          toast.error(`Falha ao enviar "${file.name}": ${upErr.message}`);
          continue;
        }

        const reg = await registrarArquivoProtetico({
          orderId,
          patientId,
          fileName: file.name,
          storagePath: path,
          kind,
          sizeBytes: file.size,
        });
        if (reg?.ok) enviados++;
        else {
          falhas++;
          toast.error(
            `Arquivo "${file.name}" enviado, mas não registrado: ${reg?.error ?? "erro"}`,
          );
        }
      }

      if (falhas === 0) {
        toast.success(
          anexos.length > 0
            ? `Pedido protético criado com ${enviados} anexo(s).`
            : "Pedido protético criado.",
        );
      } else {
        toast.warning(
          `Pedido criado. ${enviados} anexo(s) enviado(s), ${falhas} com falha.`,
        );
      }

      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Novo Pedido Protético
        </Button>
      </div>

      {/* Lista de pedidos */}
      {pedidos.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-5 py-16 text-center">
          <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted-surface text-muted">
            <Crown className="h-7 w-7" />
          </span>
          <p className="font-medium text-ink">Nenhum pedido protético</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            Abra o primeiro pedido de trabalho ao laboratório de prótese.
          </p>
        </Card>
      ) : (
        <Stagger className="flex flex-col gap-3">
          {pedidos.map((p) => (
            <FadeInUp key={p.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Crown className="h-5 w-5" />
                    </span>
                    <div
                      className={cn(
                        p.cancelledAt !== null &&
                          "text-status-danger [&_*]:text-status-danger",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-ink">{p.workType}</p>
                        <span className="text-sm text-muted">
                          · Dentes {p.teeth}
                        </span>
                        {p.urgent && (
                          <Badge status="danger">
                            <AlertTriangle className="h-3 w-3" /> Urgente
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {p.profissional} · {p.criadoEm}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted">
                        {p.material !== "—" && <span>Material: {p.material}</span>}
                        {p.color !== "—" && <span>Cor: {p.color}</span>}
                        {p.finishLine && <span>Término: {p.finishLine}</span>}
                        {p.occlusion && <span>Oclusão: {p.occlusion}</span>}
                        {p.dueDate && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" /> Prazo {p.dueDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {!p.cancelledAt && (
                      <Badge status={p.status === "aberto" ? "wait" : "ok"}>
                        {p.status}
                      </Badge>
                    )}
                    <DocumentActions
                      cancelled={p.cancelledAt !== null}
                      cancelReason={p.cancelReason}
                      pending={pending}
                      onView={() => setVerPedido(p)}
                      onEdit={() => setEditar(p)}
                      onPrint={() => imprimirPedido(p)}
                      onCancel={() => setCancelar(p)}
                    />
                  </div>
                </div>

                {p.clinicalNotes && (
                  <p
                    className={cn(
                      "mt-3 border-t border-line pt-3 text-sm text-muted",
                      p.cancelledAt !== null && "text-status-danger",
                    )}
                  >
                    {p.clinicalNotes}
                  </p>
                )}

                {p.arquivos.length > 0 && (
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
                      <Paperclip className="h-3.5 w-3.5" />
                      {p.arquivos.length} anexo(s)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {p.arquivos.map((a) => {
                        const Icon = iconeKind(a.kind);
                        return (
                          <span
                            key={a.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1 text-xs text-ink"
                          >
                            <Icon className="h-3.5 w-3.5 text-brand-600" />
                            <span className="max-w-[180px] truncate">
                              {a.fileName}
                            </span>
                            <span className="text-muted">
                              · {rotuloKind(a.kind)}
                              {a.sizeBytes != null
                                ? ` · ${fmtTamanho(a.sizeBytes)}`
                                : ""}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            </FadeInUp>
          ))}
        </Stagger>
      )}

      {/* Modal: stepper de 3 etapas */}
      <Modal
        open={open}
        onClose={fechar}
        title="Novo Pedido Protético"
        subtitle={`Etapa ${step + 1} de ${STEPS.length} · ${STEPS[step]}`}
        className="max-w-3xl"
        footer={
          <>
            {step > 0 ? (
              <Button
                variant="outline"
                onClick={() => setStep((s) => s - 1)}
                disabled={pending}
              >
                Voltar
              </Button>
            ) : (
              <Button variant="outline" onClick={fechar} disabled={pending}>
                Cancelar
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button onClick={avancar}>Avançar</Button>
            ) : (
              <Button onClick={concluir} disabled={pending || !temScan}>
                {pending ? "Enviando…" : "Concluir Pedido"}
              </Button>
            )}
          </>
        }
      >
        {/* Indicador de etapas */}
        <ol className="mb-6 flex items-center gap-2">
          {STEPS.map((label, i) => {
            const done = i < step;
            const atual = i === step;
            return (
              <li key={label} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    "flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-semibold transition-colors",
                    done && "bg-brand-500 text-white",
                    atual && "bg-brand-100 text-brand-700 ring-2 ring-brand-400",
                    !done && !atual && "bg-muted-surface text-muted",
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "hidden text-xs font-medium sm:block",
                    atual ? "text-ink" : "text-muted",
                  )}
                >
                  {label}
                </span>
                {i < STEPS.length - 1 && (
                  <span className="h-px flex-1 bg-line" aria-hidden />
                )}
              </li>
            );
          })}
        </ol>

        {/* Etapa 1 — Dados Básicos */}
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <span className="mb-2 block text-sm font-medium text-ink">
                Dentes do trabalho <span className="text-red-500">*</span>
              </span>
              <Odontograma 
                selectedTeeth={teeth.split(",").map(t => t.trim()).filter(Boolean)} 
                onChange={(arr) => setTeeth(arr.join(", "))} 
              />
              <span className="mt-1.5 block text-xs text-muted">
                Dentes selecionados: {teeth || "Nenhum"}
              </span>
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Tipo de trabalho <span className="text-red-500">*</span>
              </span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TIPOS_TRABALHO.map((t) => {
                  const sel = workType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setWorkType(t)}
                      aria-pressed={sel}
                      className={cn(
                        "flex h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                        sel
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-line bg-white text-ink hover:border-brand-200 hover:bg-brand-50/40",
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-line p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <AlertTriangle className="h-4 w-4 text-orange-500" /> Trabalho
                    Urgente
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Define o prazo de entrega do laboratório.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={urgent}
                  aria-label="Trabalho urgente"
                  onClick={() => setUrgent((u) => !u)}
                  className={cn(
                    "relative h-6 w-11 flex-none rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                    urgent ? "bg-brand-500" : "bg-line",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                      urgent && "translate-x-5",
                    )}
                  />
                </button>
              </div>
              <div
                className={cn(
                  "mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
                  urgent
                    ? "bg-red-50 text-red-600"
                    : "bg-blue-50 text-blue-600",
                )}
              >
                <Clock className="h-4 w-4" />
                Prazo estimado: {urgent ? "5 dias (urgente)" : "10 dias (padrão)"}
              </div>
            </div>
          </div>
        )}

        {/* Etapa 2 — Especificações */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Material"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="Ex.: Zircônia, e.max, metalocerâmica…"
              />
              <Input
                label="Cor / Escala"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="Ex.: A2, B1, BL3…"
              />
              <Input
                label="Linha de término"
                value={finishLine}
                onChange={(e) => setFinishLine(e.target.value)}
                placeholder="Ex.: chanfro, ombro, lâmina de faca…"
              />
              <Input
                label="Oclusão"
                value={occlusion}
                onChange={(e) => setOcclusion(e.target.value)}
                placeholder="Ex.: guia incisal, contatos em MIH…"
              />
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Observações clínicas
              </span>
              <textarea
                rows={5}
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                placeholder="Contatos proximais, instruções gerais ao laboratório…"
                className="w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>
          </div>
        )}

        {/* Etapa 3 — Anexos */}
        {step === 2 && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-muted-surface/40 px-5 py-10 text-center transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Upload className="h-6 w-6" />
              </span>
              <span className="text-sm font-medium text-ink">
                Clique para selecionar arquivos
              </span>
              <span className="text-xs text-muted">
                Scans/STL, fotos, radiografias e guias de mordida
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={onPickFiles}
              className="sr-only"
              aria-hidden
            />

            {/* Aviso de obrigatoriedade do Scan/STL (5.5). */}
            {!temScan && (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700"
              >
                <AlertTriangle className="h-4 w-4 flex-none" />
                É obrigatório anexar ao menos um arquivo de{" "}
                <span className="font-semibold">Scan / STL</span> para concluir o
                pedido.
              </p>
            )}

            {anexos.length === 0 ? (
              <p className="text-center text-sm text-muted">
                Nenhum arquivo selecionado.
              </p>
            ) : (
              <ul className="space-y-2">
                {anexos.map((a, i) => {
                  const Icon = iconeKind(a.kind);
                  return (
                    <li
                      key={`${a.file.name}-${i}`}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-3"
                    >
                      <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {a.file.name}
                        </p>
                        <p className="text-xs text-muted">
                          {fmtTamanho(a.file.size)}
                        </p>
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-muted">
                        <span className="sr-only">Tipo do anexo</span>
                        <select
                          value={a.kind}
                          onChange={(e) =>
                            setAnexoKind(i, e.target.value as KindArquivo)
                          }
                          className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        >
                          {TIPOS_ARQUIVO.map(([value, rotulo]) => (
                            <option key={value} value={value}>
                              {rotulo}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => removerAnexo(i)}
                        aria-label={`Remover ${a.file.name}`}
                        className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Resumo do pedido */}
            <div className="rounded-xl border border-line bg-muted-surface/40 p-4 text-sm">
              <p className="mb-2 font-semibold text-ink">Resumo do pedido</p>
              <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                <div className="flex gap-1.5">
                  <dt className="text-muted">Dentes:</dt>
                  <dd className="text-ink">{teeth || "—"}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-muted">Tipo:</dt>
                  <dd className="text-ink">{workType || "—"}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-muted">Material:</dt>
                  <dd className="text-ink">{material || "—"}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-muted">Cor:</dt>
                  <dd className="text-ink">{color || "—"}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-muted">Prazo:</dt>
                  <dd className="text-ink">
                    {urgent ? "5 dias (urgente)" : "10 dias (padrão)"}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-muted">Anexos:</dt>
                  <dd className="text-ink">{anexos.length}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </Modal>

      {/* Visualizar (somente leitura) */}
      <VerPedidoModal
        pedido={verPedido}
        onClose={() => setVerPedido(null)}
        onPrint={imprimirPedido}
      />

      {/* Editar */}
      <EditarPedidoModal
        pedido={editar}
        patientId={patientId}
        pending={pending}
        onClose={() => setEditar(null)}
        onSaved={() => {
          setEditar(null);
          router.refresh();
        }}
        startTransition={startTransition}
      />

      {/* Cancelar (não destrutivo) */}
      <CancelarDocumentoModal
        open={cancelar !== null}
        onClose={() => setCancelar(null)}
        onConfirm={confirmarCancelamento}
        pending={pending}
        titulo="Cancelar pedido protético"
      />
    </>
  );
}

// ── Modal: visualizar pedido (read-only) ─────────────────────────
function VerPedidoModal({
  pedido,
  onClose,
  onPrint,
}: {
  pedido: PedidoProtetico | null;
  onClose: () => void;
  onPrint: (p: PedidoProtetico) => void;
}) {
  return (
    <Modal
      open={pedido !== null}
      onClose={onClose}
      title="Pedido protético"
      subtitle={pedido ? `${pedido.workType} · Dentes ${pedido.teeth}` : undefined}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          {pedido && (
            <Button variant="outline" onClick={() => onPrint(pedido)}>
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
          )}
        </>
      }
    >
      {pedido && (
        <div className="space-y-4 text-sm">
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {[
              ["Tipo de trabalho", pedido.workType],
              ["Dentes", pedido.teeth],
              ["Material", pedido.material],
              ["Cor / Escala", pedido.color],
              ["Linha de término", pedido.finishLine || "—"],
              ["Oclusão", pedido.occlusion || "—"],
              ["Prazo", pedido.dueDate ?? "—"],
              ["Urgente", pedido.urgent ? "Sim" : "Não"],
              ["Profissional", pedido.profissional],
              ["Criado em", pedido.criadoEm],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="flex flex-col">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                  {rotulo}
                </dt>
                <dd className="mt-0.5 text-ink">{valor}</dd>
              </div>
            ))}
          </dl>

          {pedido.clinicalNotes && (
            <div className="border-t border-line pt-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                Observações clínicas
              </p>
              <p className="whitespace-pre-wrap text-ink">{pedido.clinicalNotes}</p>
            </div>
          )}

          {pedido.arquivos.length > 0 && (
            <div className="border-t border-line pt-3">
              <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
                <Paperclip className="h-3.5 w-3.5" />
                {pedido.arquivos.length} anexo(s)
              </p>
              <div className="flex flex-wrap gap-2">
                {pedido.arquivos.map((a) => {
                  const Icon = iconeKind(a.kind);
                  return (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1 text-xs text-ink"
                    >
                      <Icon className="h-3.5 w-3.5 text-brand-600" />
                      <span className="max-w-[180px] truncate">{a.fileName}</span>
                      <span className="text-muted">· {rotuloKind(a.kind)}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── Modal: editar pedido ─────────────────────────────────────────
function EditarPedidoModal({
  pedido,
  patientId,
  pending,
  onClose,
  onSaved,
  startTransition,
}: {
  pedido: PedidoProtetico | null;
  patientId: string;
  pending: boolean;
  onClose: () => void;
  onSaved: () => void;
  startTransition: React.TransitionStartFunction;
}) {
  const [teeth, setTeeth] = useState("");
  const [workType, setWorkType] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [material, setMaterial] = useState("");
  const [color, setColor] = useState("");
  const [finishLine, setFinishLine] = useState("");
  const [occlusion, setOcclusion] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");

  // Preenche os campos quando um pedido é aberto para edição.
  const pedidoId = pedido?.id ?? null;
  const carregadoRef = useRef<string | null>(null);
  if (pedido && carregadoRef.current !== pedidoId) {
    carregadoRef.current = pedidoId;
    setTeeth(pedido.teeth === "—" ? "" : pedido.teeth);
    setWorkType(pedido.workType === "—" ? "" : pedido.workType);
    setUrgent(pedido.urgent);
    setMaterial(pedido.material === "—" ? "" : pedido.material);
    setColor(pedido.color === "—" ? "" : pedido.color);
    setFinishLine(pedido.finishLine);
    setOcclusion(pedido.occlusion);
    setClinicalNotes(pedido.clinicalNotes);
  }
  if (!pedido) carregadoRef.current = null;

  function salvar() {
    if (!pedido) return;
    if (!teeth.trim() || !workType.trim()) {
      toast.error("Informe os dentes e o tipo de trabalho.");
      return;
    }
    startTransition(async () => {
      const res = await editarPedidoProtetico({
        orderId: pedido.id,
        patientId,
        teeth,
        workType,
        urgent,
        material,
        color,
        finishLine,
        occlusion,
        clinicalNotes,
      });
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Pedido protético atualizado.");
      onSaved();
    });
  }

  return (
    <Modal
      open={pedido !== null}
      onClose={onClose}
      title="Editar pedido protético"
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar alterações"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Dentes do trabalho"
            value={teeth}
            onChange={(e) => setTeeth(e.target.value)}
            placeholder="Ex.: 11, 21"
          />
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Tipo de trabalho
            </span>
            <select
              value={workType}
              onChange={(e) => setWorkType(e.target.value)}
              className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">Selecione…</option>
              {TIPOS_TRABALHO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Material"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
          />
          <Input
            label="Cor / Escala"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
          <Input
            label="Linha de término"
            value={finishLine}
            onChange={(e) => setFinishLine(e.target.value)}
          />
          <Input
            label="Oclusão"
            value={occlusion}
            onChange={(e) => setOcclusion(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={urgent}
            onChange={(e) => setUrgent(e.target.checked)}
            className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-400"
          />
          Trabalho urgente
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Observações clínicas
          </span>
          <textarea
            rows={4}
            value={clinicalNotes}
            onChange={(e) => setClinicalNotes(e.target.value)}
            className="w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </div>
    </Modal>
  );
}

// ── Impressão simples do pedido ──────────────────────────────────
function imprimirPedidoProtetico(
  clinica: ClinicaImpressao,
  paciente: PacienteIdent,
  p: PedidoProtetico,
) {
  const linha = (rotulo: string, valor: string) =>
    `<div class="kv"><span class="k">${esc(rotulo)}</span><span class="v">${esc(valor || "—")}</span></div>`;

  const anexos =
    p.arquivos.length > 0
      ? `<div class="anexos"><div class="corpo-lbl">Anexos</div><ul>${p.arquivos
          .map((a) => `<li>${esc(a.fileName)} — ${esc(rotuloKind(a.kind))}</li>`)
          .join("")}</ul></div>`
      : "";

  const ident = identPacienteHTML(paciente.nome, [
    { lbl: "Registro", val: limpo(paciente.registro) || "—" },
    { lbl: "Idade", val: limpo(paciente.idade) || "—" },
    { lbl: "Convênio", val: limpo(paciente.convenio) || "—" },
    { lbl: "Criado em", val: limpo(p.criadoEm) || "—" },
  ]);

  const corpo = `
    ${linha("Tipo de trabalho", p.workType)}
    ${linha("Dentes", p.teeth)}
    ${linha("Material", p.material)}
    ${linha("Cor / Escala", p.color)}
    ${linha("Linha de término", p.finishLine)}
    ${linha("Oclusão", p.occlusion)}
    ${linha("Prazo", p.dueDate ?? "—")}
    ${linha("Urgente", p.urgent ? "Sim" : "Não")}
    ${linha("Observações", p.clinicalNotes)}
    ${anexos}`;

  const html = montarDocumentoBase({
    titulo: "PEDIDO DE TRABALHO PROTÉTICO",
    clinica,
    pacienteNome: paciente.nome,
    identHTML: ident,
    corpoHTML: corpo,
    rodapeHTML: rodapeAssinaturaProfissional(
      limpo(p.profissional) || "Profissional responsável",
      "Assinatura e carimbo (CRO)",
    ),
    cssExtra: `
      .corpo { min-height: 260px; }
      .corpo .kv { display: flex; gap: 10px; padding: 5px 0; border-bottom: 1px solid #eee; font-size: 13px; }
      .corpo .kv .k { color: #555; min-width: 150px; }
      .corpo .kv .v { font-weight: 500; }
      .corpo .anexos { margin-top: 10px; }
      .corpo .anexos ul { margin: 4px 0 0; padding-left: 18px; font-size: 12px; }`,
  });

  abrirImpressao(html, "Permita pop-ups para imprimir o pedido protético.");
}
