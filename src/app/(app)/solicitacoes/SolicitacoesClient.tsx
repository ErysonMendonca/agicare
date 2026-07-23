"use client";

import { useMemo, useState } from "react";
import { Search, PackageOpen, Zap } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { AutoRefresh } from "@/components/app/AutoRefresh";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  type SolicitacaoProduto,
  type Setor,
  type SetorFornecedorOption,
} from "@/lib/data/product-requests.shared";
import { NovaSolicitacaoModal, type ProdutoOpcao } from "./NovaSolicitacaoModal";

const STATUS_FILTRO = [
  { value: "", label: "Todos os status" },
  { value: "pendente", label: "Pendentes" },
  { value: "atendida_parcial", label: "Parciais" },
  { value: "atendida", label: "Atendidas" },
  { value: "cancelada", label: "Canceladas" },
];

export function SolicitacoesClient({
  solicitacoes,
  produtos,
  setorPadrao,
  setoresFornecedor,
}: {
  solicitacoes: SolicitacaoProduto[];
  produtos: ProdutoOpcao[];
  setorPadrao: Setor;
  setoresFornecedor: SetorFornecedorOption[];
}) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return solicitacoes.filter((s) => {
      if (status && s.statusRaw !== status) return false;
      if (!q) return true;
      return (
        s.codigo.toLowerCase().includes(q) ||
        s.setor.toLowerCase().includes(q) ||
        (s.setorFornecedor?.toLowerCase().includes(q) ?? false) ||
        s.solicitante.toLowerCase().includes(q) ||
        s.itens.some((i) => i.nome.toLowerCase().includes(q))
      );
    });
  }, [solicitacoes, busca, status]);

  return (
    <div className="mt-6 space-y-4">
      <AutoRefresh />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Buscar por código, setor, produto..."
            className="pl-9"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Select
          aria-label="Filtrar por status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-44"
        >
          {STATUS_FILTRO.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <div className="ml-auto">
          <NovaSolicitacaoModal
            produtos={produtos}
            setorPadrao={setorPadrao}
            setoresFornecedor={setoresFornecedor}
          />
        </div>
      </div>

      {filtradas.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="Nenhuma solicitação"
          description="Crie a primeira solicitação de produtos para o seu setor."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtradas.map((s) => (
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
                  <p className="mt-0.5 text-sm text-muted">
                    Fornecedor:{" "}
                    <span className="text-ink">{s.setorFornecedor ?? "—"}</span>
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
                      {i.quantidade} {i.unidade}
                    </span>
                  </li>
                ))}
              </ul>

              {s.observacoes && (
                <p className="mt-2 text-xs text-muted">Obs.: {s.observacoes}</p>
              )}
              {s.statusRaw === "atendida" && s.atendidaEm && (
                <p className="mt-2 text-xs text-emerald-600">
                  Atendida por {s.atendidaPor ?? "—"} em {s.atendidaEm}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
