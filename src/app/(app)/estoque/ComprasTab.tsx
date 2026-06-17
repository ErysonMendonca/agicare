"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  FileText,
  Paperclip,
  Clock,
  Check,
  X,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { type SolicitacaoCompra } from "@/lib/data/stock";
import { decidirCompra, getCotacaoUrl } from "@/lib/actions/stock";
import { NovaCompraModal } from "./NovaCompraModal";
import { NovaCotacaoModal } from "./NovaCotacaoModal";
import { moedaBR } from "./format";

export function ComprasTab({
  compras,
  gestor,
}: {
  compras: SolicitacaoCompra[];
  gestor: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function decidir(id: string, aprovar: boolean) {
    startTransition(async () => {
      const res = await decidirCompra(id, aprovar);
      if (res?.ok) {
        toast.success(aprovar ? "Compra aprovada." : "Compra reprovada.");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível registrar a decisão.");
      }
    });
  }

  /** Abre o PDF da cotação via URL assinada (bucket privado). */
  function abrirAnexo(path: string) {
    startTransition(async () => {
      const res = await getCotacaoUrl(path);
      if (res.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      } else {
        toast.error(res.error ?? "Não foi possível abrir o anexo.");
      }
    });
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Compras</h2>
          <p className="text-sm text-muted">
            Solicitações, cotações e aprovações de compra
          </p>
        </div>
        <NovaCompraModal />
      </div>

      {compras.length === 0 ? (
        <Card className="mt-4 p-12 text-center text-muted">
          <ShoppingCart className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Nenhuma solicitação de compra no momento.
        </Card>
      ) : (
        <Stagger className="mt-4 flex flex-col gap-4">
          {compras.map((c) => (
            <FadeInUp key={c.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-ink">{c.codigo}</h3>
                    <Badge status={c.status.tone}>{c.status.label}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {(c.statusRaw === "solicitado" ||
                      c.statusRaw === "cotacao") && (
                      <NovaCotacaoModal
                        requestId={c.id}
                        requestLabel={c.codigo}
                      />
                    )}
                    {gestor && c.statusRaw === "cotacao" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => decidir(c.id, true)}
                        >
                          <Check className="h-4 w-4" /> Aprovar
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={pending}
                          onClick={() => decidir(c.id, false)}
                        >
                          <X className="h-4 w-4" /> Reprovar
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase text-muted">Produto</p>
                    <p className="mt-1 flex items-center gap-1.5 font-medium text-ink">
                      <FileText className="h-4 w-4 text-muted" /> {c.produto}
                    </p>
                    <p className="text-sm text-muted">{c.quantidade}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted">Justificativa</p>
                    <p className="mt-1 text-sm text-ink">{c.justificativa}</p>
                  </div>
                </div>

                {/* Cotações */}
                <div className="mt-4 rounded-xl border border-line bg-canvas p-4">
                  <p className="text-xs font-medium uppercase text-muted">
                    Cotações ({c.cotacoes.length})
                  </p>
                  {c.cotacoes.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">
                      Aguardando cotações dos fornecedores.
                    </p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-2">
                      {c.cotacoes.map((cot, i) => (
                        <li
                          key={`${cot.fornecedor}-${i}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                        >
                          <span className="flex items-center gap-1.5 font-medium text-ink">
                            <Truck className="h-4 w-4 text-muted" /> {cot.fornecedor}
                          </span>
                          <span className="flex flex-wrap items-center gap-3 text-muted">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" /> {cot.prazo}
                            </span>
                            {cot.anexoPath ? (
                              <button
                                type="button"
                                onClick={() => abrirAnexo(cot.anexoPath!)}
                                disabled={pending}
                                className="inline-flex items-center gap-1 text-brand-600 hover:underline disabled:opacity-50"
                              >
                                <Paperclip className="h-3.5 w-3.5" /> {cot.anexo}
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <Paperclip className="h-3.5 w-3.5" /> {cot.anexo}
                              </span>
                            )}
                            {gestor && (
                              <span className="font-semibold text-ink">
                                {moedaBR(cot.valor)}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            </FadeInUp>
          ))}
        </Stagger>
      )}
    </div>
  );
}
