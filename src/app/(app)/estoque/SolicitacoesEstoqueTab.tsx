"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PackageCheck, X, Zap, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { cancelarSolicitacao } from "@/lib/actions/product-requests";
import { type SolicitacaoProduto } from "@/lib/data/product-requests.shared";

/**
 * Aba do Estoque para ATENDER as solicitações dos setores. "Atender" navega
 * para a página dedicada de atendimento (bipagem por código de barras,
 * atendimento parcial, histórico e impressão do comprovante assinável).
 * Cancelar descarta o pedido sem tocar no estoque (só permitido enquanto
 * nada foi atendido).
 */
export function SolicitacoesEstoqueTab({
  solicitacoes,
}: {
  solicitacoes: SolicitacaoProduto[];
}) {
  const [status, setStatus] = useState("pendente");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // "Pendente" agrupa também "Parcial" — uma solicitação parcialmente atendida
  // continua precisando de ação até ser complementada ou concluída.
  const lista = useMemo(
    () =>
      status === "pendente"
        ? solicitacoes.filter(
            (s) => s.statusRaw === "pendente" || s.statusRaw === "atendida_parcial",
          )
        : status
          ? solicitacoes.filter((s) => s.statusRaw === status)
          : solicitacoes,
    [solicitacoes, status],
  );

  function agir(
    id: string,
    fn: (id: string) => Promise<{ error?: string; ok?: boolean } | undefined>,
    sucesso: string,
  ) {
    setPendingId(id);
    startTransition(async () => {
      const res = await fn(id);
      setPendingId(null);
      if (res?.ok) {
        toast.success(sucesso);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível concluir a ação.");
      }
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Solicitações dos setores (Farmácia, Recepção, Médico).
        </p>
        <Select
          aria-label="Filtrar por status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-44"
        >
          <option value="pendente">Pendentes</option>
          <option value="atendida_parcial">Parciais</option>
          <option value="atendida">Atendidas</option>
          <option value="cancelada">Canceladas</option>
          <option value="">Todas</option>
        </Select>
      </div>

      {lista.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="Nenhuma solicitação"
          description="Não há solicitações com esse status."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {lista.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">{s.codigo}</span>
                    {s.urgente && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                        <Zap className="h-3 w-3" /> Urgente
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    Setor: <span className="text-ink">{s.setor}</span> ·{" "}
                    {s.solicitante} · {s.criadaEm}
                  </p>
                </div>
                <Badge status={s.status.tone}>{s.status.label}</Badge>
              </div>

              <ul className="mt-3 space-y-1 border-t border-line pt-3">
                {s.itens.map((i, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-ink">{i.nome}</span>
                    <span className="text-muted">
                      {i.quantidadeAtendida}/{i.quantidade} {i.unidade}
                    </span>
                  </li>
                ))}
              </ul>

              {s.observacoes && (
                <p className="mt-2 text-xs text-muted">Obs.: {s.observacoes}</p>
              )}

              {s.statusRaw === "pendente" || s.statusRaw === "atendida_parcial" ? (
                <div className="mt-3 flex items-center gap-2">
                  <Link href={`/estoque/solicitacoes/${s.id}/atender`}>
                    <Button size="sm" disabled={pending && pendingId === s.id}>
                      <PackageCheck className="h-4 w-4" />
                      {s.statusRaw === "atendida_parcial"
                        ? "Continuar atendimento"
                        : "Atender"}
                    </Button>
                  </Link>
                  {s.statusRaw === "pendente" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        agir(s.id, cancelarSolicitacao, "Solicitação cancelada.")
                      }
                      disabled={pending && pendingId === s.id}
                    >
                      <X className="h-4 w-4" /> Cancelar
                    </Button>
                  )}
                </div>
              ) : s.statusRaw === "atendida" && s.atendidaEm ? (
                <p className="mt-2 text-xs text-emerald-600">
                  Atendida por {s.atendidaPor ?? "—"} em {s.atendidaEm}
                </p>
              ) : null}

              {s.statusRaw === "atendida_parcial" && s.atendidaEm && (
                <p className="mt-2 text-xs text-blue-600">
                  Último atendimento por {s.atendidaPor ?? "—"} em {s.atendidaEm}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
