"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { carregarFechamento, fecharAtendimento } from "@/lib/actions/atendimento";
import { type FilaItem } from "@/lib/data/queue";
import { type ProcedimentoExecutado } from "@/lib/data/atendimento";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const METODOS = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "cartao", label: "Cartão" },
  { value: "boleto", label: "Boleto" },
  { value: "convenio", label: "Convênio" },
];

/**
 * Fechamento do atendimento (recepção): mostra os procedimentos registrados
 * pelo médico + total, recebe o pagamento (forma + valor) e finaliza.
 */
export function FechamentoModal({
  item,
  open,
  onClose,
}: {
  item: FilaItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [carregando, setCarregando] = useState(false);
  const [itens, setItens] = useState<ProcedimentoExecutado[]>([]);
  const [total, setTotal] = useState(0);
  const [method, setMethod] = useState("dinheiro");

  // Carrega os procedimentos/total ao abrir (async IIFE evita setState síncrono
  // no corpo do efeito; `ativo` descarta resposta após fechar/trocar).
  useEffect(() => {
    if (!open || !item) return;
    let ativo = true;
    void (async () => {
      setCarregando(true);
      try {
        const res = await carregarFechamento(item.id);
        if (!ativo) return;
        if (res.error) {
          toast.error(res.error);
          return;
        }
        setItens(res.itens);
        setTotal(res.total);
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [open, item]);

  function receber() {
    if (!item) return;
    startTransition(async () => {
      // O valor é recomputado no servidor (total dos procedimentos); aqui só a forma.
      const res = await fecharAtendimento({
        queueEntryId: item.id,
        method: method as "dinheiro" | "pix" | "cartao" | "boleto" | "convenio",
      });
      if (res?.ok) {
        toast.success("Pagamento recebido. Atendimento finalizado.");
        onClose();
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível fechar o atendimento.");
      }
    });
  }

  if (!item) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Fechamento — ${item.paciente}`}
      subtitle="Procedimentos do atendimento, valor e recebimento"
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={receber} disabled={pending || carregando}>
            <Wallet className="h-4 w-4" />
            {pending ? "Finalizando..." : "Receber e Finalizar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Procedimentos + total */}
        <div className="rounded-xl border border-line">
          {carregando ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              Carregando procedimentos…
            </p>
          ) : itens.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              Nenhum procedimento registrado no atendimento.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {itens.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
                  <span className="text-ink">{p.nome}</span>
                  <span className="font-medium text-ink">{brl(p.valor)}</span>
                </li>
              ))}
              <li className="flex items-center justify-between bg-muted-surface px-4 py-2.5 text-sm font-semibold">
                <span className="text-ink">Total</span>
                <span className="text-brand-700">{brl(total)}</span>
              </li>
            </ul>
          )}
        </div>

        {/* Recebimento */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Forma de pagamento"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {METODOS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Valor a receber
            </span>
            <span className="inline-flex h-10 w-full items-center rounded-lg border border-line bg-muted-surface px-3 text-sm font-semibold text-ink">
              {brl(total)}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
