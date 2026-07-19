"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Stethoscope,
  Plus,
  Trash2,
  Clock,
  FileText,
  History,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import {
  registrarProcedimento,
  removerProcedimento,
} from "@/lib/actions/atendimento";
import {
  salvarDocumentoProcedimentos,
  carregarDocumentoProcedimentos,
} from "@/lib/actions/procedimento-doc";
import { cancelarDocumento } from "@/lib/actions/documento-cancelamento";
import { DocumentActions } from "@/components/clinico/DocumentActions";
import { CancelarDocumentoModal } from "@/components/clinico/CancelarDocumentoModal";
import {
  type ProcedimentoCatalogo,
  type ProcedimentoExecutado,
} from "@/lib/data/atendimento";
import {
  type ProcedimentoDocResumo,
  type ProcedimentoDocDetalhe,
} from "@/lib/data/procedimento-doc";
import {
  imprimirProcedimentos,
  type CabecalhoProcedimentos,
} from "./procedimento/ProcedimentosImpressao";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Documento do histórico com a data já formatada no servidor (evita hidratação divergente). */
export type ProcedimentoDocHistorico = ProcedimentoDocResumo & {
  dataLabel: string;
};

/**
 * Card do atendimento em andamento (médico): registra os procedimentos
 * realizados (do catálogo, com preço) para o faturamento E, ao "Salvar
 * documento", gera um DOCUMENTO de procedimentos imprimível/cancelável (padrão
 * do prontuário). Vários documentos podem ser gerados no mesmo atendimento.
 */
export function AtendimentoAtivoCard({
  patientId,
  queueEntryId,
  statusRaw,
  catalogo,
  procedimentos,
  documentos,
  cabecalho,
}: {
  patientId: string;
  queueEntryId: string;
  statusRaw: string;
  catalogo: ProcedimentoCatalogo[];
  procedimentos: ProcedimentoExecutado[];
  documentos: ProcedimentoDocHistorico[];
  cabecalho: CabecalhoProcedimentos;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [procId, setProcId] = useState("");

  // Documento: salvar / visualizar / cancelar.
  const [salvando, startSalvar] = useTransition();
  const [aberto, setAberto] = useState<ProcedimentoDocHistorico | null>(null);
  const [detalhe, setDetalhe] = useState<ProcedimentoDocDetalhe | null>(null);
  const [carregando, startCarregar] = useTransition();
  const [cancelar, setCancelar] = useState<ProcedimentoDocHistorico | null>(null);
  const [cancelando, startCancelar] = useTransition();

  const emAtendimento = statusRaw === "em_atendimento";

  function adicionar() {
    if (!procId) {
      toast.error("Selecione um procedimento.");
      return;
    }
    startTransition(async () => {
      const res = await registrarProcedimento({ queueEntryId, procedureId: procId });
      if (res?.ok) {
        setProcId("");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível registrar o procedimento.");
      }
    });
  }

  function remover(id: string) {
    startTransition(async () => {
      const res = await removerProcedimento(id);
      if (res?.ok) router.refresh();
      else toast.error(res?.error ?? "Não foi possível remover.");
    });
  }

  function salvarDocumento() {
    if (procedimentos.length === 0) {
      toast.error("Adicione ao menos um procedimento para gerar o documento.");
      return;
    }
    startSalvar(async () => {
      const res = await salvarDocumentoProcedimentos({ patientId });
      if (res?.ok) {
        toast.success("Documento de procedimentos gerado.");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível gerar o documento.");
      }
    });
  }

  function abrir(item: ProcedimentoDocHistorico) {
    setAberto(item);
    setDetalhe(null);
    startCarregar(async () => {
      const res = await carregarDocumentoProcedimentos(patientId, item.id);
      if (res.error || !res.detalhe) {
        toast.error(res.error ?? "Não foi possível abrir o documento.");
        setAberto(null);
        return;
      }
      setDetalhe(res.detalhe);
    });
  }

  function imprimirItem(item: ProcedimentoDocHistorico) {
    startCarregar(async () => {
      const res = await carregarDocumentoProcedimentos(patientId, item.id);
      if (res.error || !res.detalhe) {
        toast.error(res.error ?? "Não foi possível abrir o documento.");
        return;
      }
      imprimirProcedimentos(
        {
          ...cabecalho,
          data: item.dataLabel,
          profissional: res.detalhe.professionalName,
          atendimento: item.atendimentoCodigo ?? "—",
        },
        res.detalhe.itens,
        res.detalhe.total,
      );
    });
  }

  function confirmarCancelamento(motivo: string) {
    if (!cancelar) return;
    startCancelar(async () => {
      const res = await cancelarDocumento({
        tabela: "procedure_documents",
        id: cancelar.id,
        motivo,
      });
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Documento cancelado.");
      setCancelar(null);
      router.refresh();
    });
  }

  return (
    <>
      <Card className="mb-6 border-brand-200 bg-brand-50/40 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white">
              <Stethoscope className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-semibold text-ink">Atendimento em andamento</h3>
              <p className="text-xs text-muted">
                {emAtendimento
                  ? "Registre os procedimentos e finalize o atendimento."
                  : "Finalizado — aguardando pagamento na recepção."}
              </p>
            </div>
          </div>
          {!emAtendimento && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
              <Clock className="h-3.5 w-3.5" /> Aguardando pagamento
            </span>
          )}
        </div>

        {/* Adicionar procedimento (só durante o atendimento). */}
        {emAtendimento && (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1">
              <Select
                aria-label="Procedimento"
                value={procId}
                onChange={(e) => setProcId(e.target.value)}
              >
                <option value="">Selecione o procedimento</option>
                {catalogo.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="outline" onClick={adicionar} disabled={pending}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        )}

        {/* Procedimentos registrados */}
        <div className="mt-4 rounded-xl border border-line bg-white">
          {procedimentos.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              Nenhum procedimento registrado neste atendimento.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {procedimentos.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-ink">{p.nome}</span>
                  <span className="flex items-center gap-3">
                    {emAtendimento && (
                      <button
                        type="button"
                        onClick={() => remover(p.id)}
                        disabled={pending}
                        aria-label="Remover procedimento"
                        className="rounded-lg p-1.5 text-muted hover:text-red-600 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Gerar documento de procedimentos (fotografa os itens acima). */}
        {emAtendimento && (
          <div className="mt-3 flex justify-end">
            <Button
              variant="primary"
              onClick={salvarDocumento}
              disabled={salvando || procedimentos.length === 0}
            >
              <FileText className="h-4 w-4" />
              {salvando ? "Gerando…" : "Salvar documento"}
            </Button>
          </div>
        )}
      </Card>

      {/* Documentos de procedimentos gerados neste paciente. */}
      <Card className="p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <History className="h-4 w-4 text-muted" aria-hidden />
          Documentos de procedimentos
        </h3>

        {documentos.length === 0 ? (
          <p className="text-sm text-muted">
            Nenhum documento gerado. Registre procedimentos e clique em
            “Salvar documento”.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {documentos.map((item) => {
              const cancelado = item.cancelledAt !== null;
              return (
                <li key={item.id} className="rounded-lg border border-line px-2.5 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => !cancelado && abrir(item)}
                      disabled={cancelado}
                      className={cn(
                        "flex flex-1 flex-col items-start gap-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-default",
                        cancelado && "text-status-danger [&_*]:text-status-danger",
                      )}
                    >
                      <span className="text-sm font-medium text-ink">
                        {item.dataLabel}
                      </span>
                      <span className="text-xs font-medium text-brand-600">
                        Atendimento nº {item.atendimentoCodigo ?? "—"}
                      </span>
                      <span className="text-xs text-muted">
                        {item.professionalName} · {item.totalItens}{" "}
                        {item.totalItens === 1 ? "procedimento" : "procedimentos"} ·{" "}
                        {item.totalLabel}
                      </span>
                    </button>
                    <DocumentActions
                      cancelled={cancelado}
                      cancelReason={item.cancelReason}
                      pending={carregando || cancelando}
                      onView={() => abrir(item)}
                      onPrint={() => imprimirItem(item)}
                      onCancel={() => setCancelar(item)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <CancelarDocumentoModal
        open={cancelar !== null}
        onClose={() => setCancelar(null)}
        onConfirm={confirmarCancelamento}
        pending={cancelando}
        titulo="Cancelar documento de procedimentos"
      />

      <Modal
        open={aberto !== null}
        onClose={() => setAberto(null)}
        title={`Procedimentos de ${aberto?.dataLabel ?? ""}`}
        subtitle={
          aberto
            ? `${aberto.professionalName} · Atendimento nº ${aberto.atendimentoCodigo ?? "—"} · somente leitura`
            : undefined
        }
        className="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAberto(null)}>
              Fechar
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                detalhe &&
                aberto &&
                imprimirProcedimentos(
                  {
                    ...cabecalho,
                    data: aberto.dataLabel,
                    profissional: detalhe.professionalName,
                    atendimento: aberto.atendimentoCodigo ?? "—",
                  },
                  detalhe.itens,
                  detalhe.total,
                )
              }
              disabled={!detalhe}
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
          </>
        }
      >
        {carregando || !detalhe ? (
          <p className="py-8 text-center text-sm text-muted">Carregando…</p>
        ) : (
          <div className="rounded-xl border border-line">
            <ul className="divide-y divide-line">
              {detalhe.itens.map((it, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-ink">{it.nome}</span>
                  <span className="text-muted">{brl(it.valor)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-sm font-semibold text-ink">
              <span>Total</span>
              <span>{detalhe.totalLabel}</span>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
