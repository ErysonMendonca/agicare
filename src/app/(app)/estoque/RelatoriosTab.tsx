"use client";

import { useMemo } from "react";
import { Lock, TrendingUp, PieChart } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BarChart } from "@/components/ui/Charts";
import { type ProdutoEstoque } from "@/lib/data/stock";
import { moedaBR } from "./format";

type Faixa = "Normal" | "Crítico" | "Excesso";

/** Classifica o produto pela cobertura de estoque vs. mínimo. */
function classificar(p: ProdutoEstoque): Faixa {
  if (p.saldo < p.minimo) return "Crítico";
  if (p.saldo > p.minimo * 2) return "Excesso";
  return "Normal";
}

export function RelatoriosTab({
  produtos,
  gestor,
}: {
  produtos: ProdutoEstoque[];
  gestor: boolean;
}) {
  const distribuicao = useMemo(() => {
    const base: Record<Faixa, number> = { Normal: 0, Crítico: 0, Excesso: 0 };
    for (const p of produtos) base[classificar(p)] += 1;
    return base;
  }, [produtos]);

  const valorizacao = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of produtos) {
      map.set(p.categoria, (map.get(p.categoria) ?? 0) + p.saldo * p.custo);
    }
    const labels = Array.from(map.keys());
    const series = labels.map((l) => Math.round(map.get(l) ?? 0));
    return { labels, series };
  }, [produtos]);

  const valorTotal = useMemo(
    () => produtos.reduce((s, p) => s + p.saldo * p.custo, 0),
    [produtos],
  );

  const faixas: Array<{ faixa: Faixa; tone: "ok" | "danger" | "warn" }> = [
    { faixa: "Normal", tone: "ok" },
    { faixa: "Crítico", tone: "danger" },
    { faixa: "Excesso", tone: "warn" },
  ];

  return (
    <div className="mt-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink">Relatórios e Inteligência</h2>
        <p className="text-sm text-muted">
          Distribuição por status e valorização do estoque
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Distribuição por status (não financeiro) */}
        <Card className="p-5">
          <h3 className="flex items-center gap-2 font-semibold text-ink">
            <PieChart className="h-4 w-4 text-brand-600" /> Distribuição por Status
          </h3>
          <div className="mt-4 flex flex-col gap-3">
            {faixas.map(({ faixa, tone }) => {
              const qtd = distribuicao[faixa];
              const pct = produtos.length
                ? Math.round((qtd / produtos.length) * 100)
                : 0;
              return (
                <div key={faixa}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <Badge status={tone}>{faixa}</Badge>
                    <span className="text-muted">
                      {qtd} item(ns) · {pct}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted-surface">
                    <div
                      className={
                        tone === "ok"
                          ? "h-full rounded-full bg-green-500"
                          : tone === "danger"
                            ? "h-full rounded-full bg-red-500"
                            : "h-full rounded-full bg-orange-500"
                      }
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Valorização por categoria (FINANCEIRO — gestor) */}
        <Card className="p-5">
          <h3 className="flex items-center gap-2 font-semibold text-ink">
            <TrendingUp className="h-4 w-4 text-brand-600" /> Valorização por Categoria
          </h3>
          {gestor ? (
            <div className="mt-4">
              <BarChart series={valorizacao.series} labels={valorizacao.labels} />
              <p className="mt-2 text-right text-sm text-muted">
                Total em estoque:{" "}
                <span className="font-semibold text-ink">{moedaBR(valorTotal)}</span>
              </p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border border-line bg-muted-surface p-8 text-center">
              <Lock className="h-6 w-6 text-muted" />
              <p className="text-sm text-muted">
                Valorização financeira restrita ao gestor.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Tabela detalhada */}
      <Card className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted">
                <th className="px-5 py-3 font-medium">Produto</th>
                <th className="px-5 py-3 font-medium">Categoria</th>
                <th className="px-5 py-3 font-medium">Estoque Atual</th>
                <th className="px-5 py-3 font-medium">Mínimo</th>
                {gestor && <th className="px-5 py-3 font-medium">Valor Unitário</th>}
                {gestor && <th className="px-5 py-3 font-medium">Valor Total</th>}
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => {
                const faixa = classificar(p);
                const tone =
                  faixa === "Crítico" ? "danger" : faixa === "Excesso" ? "warn" : "ok";
                return (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-medium text-ink">{p.produto}</td>
                    <td className="px-5 py-3 text-muted">{p.categoria}</td>
                    <td className="px-5 py-3 text-ink">{p.saldo}</td>
                    <td className="px-5 py-3 text-muted">{p.minimo}</td>
                    {gestor && <td className="px-5 py-3 text-muted">{moedaBR(p.custo)}</td>}
                    {gestor && (
                      <td className="px-5 py-3 font-medium text-ink">
                        {moedaBR(p.saldo * p.custo)}
                      </td>
                    )}
                    <td className="px-5 py-3">
                      <Badge status={tone}>{faixa}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
