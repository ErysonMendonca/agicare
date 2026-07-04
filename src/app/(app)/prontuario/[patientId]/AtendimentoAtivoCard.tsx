"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Stethoscope, Plus, Trash2, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  registrarProcedimento,
  removerProcedimento,
  finalizarAtendimento,
} from "@/lib/actions/atendimento";
import {
  type ProcedimentoCatalogo,
  type ProcedimentoExecutado,
} from "@/lib/data/atendimento";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Card do atendimento em andamento (médico): registra os procedimentos
 * realizados (do catálogo, com preço) e finaliza o atendimento clínico, que
 * então vai para a recepção fazer o fechamento (recebimento + finalizar).
 */
export function AtendimentoAtivoCard({
  patientId,
  queueEntryId,
  statusRaw,
  catalogo,
  procedimentos,
  totalLabel,
}: {
  patientId: string;
  queueEntryId: string;
  statusRaw: string;
  catalogo: ProcedimentoCatalogo[];
  procedimentos: ProcedimentoExecutado[];
  totalLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [procId, setProcId] = useState("");

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

  function finalizar() {
    startTransition(async () => {
      const res = await finalizarAtendimento(queueEntryId);
      if (res?.ok) {
        toast.success("Atendimento finalizado. Encaminhado à recepção para pagamento.");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível finalizar o atendimento.");
      }
    });
  }

  return (
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
        {emAtendimento ? (
          <Button
            onClick={finalizar}
            disabled={pending}
            data-patient={patientId}
            className="shrink-0"
          >
            <CheckCircle2 className="h-4 w-4" /> Finalizar Atendimento
          </Button>
        ) : (
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
                  {p.nome} — {brl(p.preco)}
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
                  <span className="font-medium text-ink">{brl(p.valor)}</span>
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
            <li className="flex items-center justify-between bg-muted-surface px-4 py-2.5 text-sm font-semibold">
              <span className="text-ink">Total</span>
              <span className="text-brand-700">{totalLabel}</span>
            </li>
          </ul>
        )}
      </div>

    </Card>
  );
}
