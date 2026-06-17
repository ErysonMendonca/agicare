"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Barcode, Calendar, CheckCircle2, Circle, Zap } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { type Dispensacao } from "@/lib/data/stock";
import {
  concluirSeparacao,
  atualizarProgressoSeparacao,
  marcarUrgente,
} from "@/lib/actions/stock";

/**
 * Modal de Separação (picking): localização física, código de barras, lote,
 * validade, barra de progresso e marcação de urgente.
 */
export function SeparacaoModal({
  pedido,
  open,
  onClose,
}: {
  pedido: Dispensacao;
  open: boolean;
  onClose: () => void;
}) {
  const total = pedido.itens.length;
  const [marcados, setMarcados] = useState<boolean[]>([]);
  const [urgente, setUrgente] = useState(pedido.urgente);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Reinicia o estado ao trocar de pedido/abrir.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMarcados(pedido.itens.map((i) => i.separado));
     
    setUrgente(pedido.urgente);
  }, [pedido]);

  const concluidos = marcados.filter(Boolean).length;
  const progresso = total ? Math.round((concluidos / total) * 100) : 0;

  function toggleItem(idx: number) {
    setMarcados((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      const done = next.filter(Boolean).length;
      const prog = total ? Math.round((done / total) * 100) : 0;
      startTransition(async () => {
        await atualizarProgressoSeparacao(pedido.id, prog);
      });
      return next;
    });
  }

  function toggleUrgente() {
    const novo = !urgente;
    setUrgente(novo);
    startTransition(async () => {
      const res = await marcarUrgente(pedido.id, novo);
      if (res?.error) toast.error(res.error);
    });
  }

  function handleConcluir() {
    startTransition(async () => {
      const res = await concluirSeparacao(pedido.id);
      if (res?.ok) {
        toast.success("Separação concluída.");
        router.refresh();
        onClose();
      } else {
        toast.error(res?.error ?? "Não foi possível concluir a separação.");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Separação — ${pedido.codigo}`}
      subtitle="Confira a localização, lote e validade de cada item"
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button
            onClick={handleConcluir}
            disabled={pending || concluidos < total}
          >
            Concluir Separação
          </Button>
        </>
      }
    >
      {/* Cabeçalho: origem + urgente */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-muted">{pedido.origem.rotulo}</p>
          <p className="font-medium text-ink">{pedido.origem.nome}</p>
          <p className="text-sm text-muted">{pedido.origem.identificador}</p>
        </div>
        <button
          type="button"
          onClick={toggleUrgente}
          disabled={pending}
          className={
            urgente
              ? "inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600"
              : "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:text-ink"
          }
        >
          <Zap className="h-3.5 w-3.5" /> {urgente ? "Urgente" : "Marcar Urgente"}
        </button>
      </div>

      {/* Barra de progresso */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
          <span>Progresso da separação</span>
          <span className="font-medium text-ink">
            {concluidos}/{total} · {progresso}%
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted-surface">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-300"
            style={{ width: `${progresso}%` }}
          />
        </div>
      </div>

      {/* Itens */}
      <ul className="mt-4 flex flex-col gap-3">
        {pedido.itens.map((item, idx) => {
          const ok = marcados[idx];
          return (
            <li
              key={`${item.nome}-${idx}`}
              className={
                ok
                  ? "rounded-xl border border-brand-200 bg-brand-50/40 p-4"
                  : "rounded-xl border border-line bg-surface p-4"
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{item.nome}</p>
                  <p className="text-sm text-muted">{item.quantidade}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleItem(idx)}
                  disabled={pending}
                  aria-label={ok ? "Desmarcar item" : "Marcar item separado"}
                  className={ok ? "text-brand-600" : "text-muted hover:text-ink"}
                >
                  {ok ? (
                    <CheckCircle2 className="h-6 w-6" />
                  ) : (
                    <Circle className="h-6 w-6" />
                  )}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted sm:grid-cols-2">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {item.localizacao}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Barcode className="h-3.5 w-3.5" /> {item.codigoBarras}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Badge status="active">Lote {item.lote}</Badge>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Validade {item.validade}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
