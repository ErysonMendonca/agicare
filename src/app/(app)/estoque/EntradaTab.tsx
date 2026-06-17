"use client";

import { FileText, Truck, ArrowDownToLine } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  type EntradaProduto,
  type Fornecedor,
  type ProdutoEstoque,
} from "@/lib/data/stock";
import { EntradaModal } from "./EntradaModal";
import { moedaBR } from "./format";

export function EntradaTab({
  entradas,
  fornecedores,
  produtos,
  gestor,
}: {
  entradas: EntradaProduto[];
  fornecedores: Fornecedor[];
  produtos: ProdutoEstoque[];
  gestor: boolean;
}) {
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Entradas de Produtos</h2>
          <p className="text-sm text-muted">
            Recebimentos vinculados a Notas Fiscais
          </p>
        </div>
        <EntradaModal
          fornecedores={fornecedores}
          produtos={produtos}
          gestor={gestor}
        />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted">
                <th className="px-5 py-3 font-medium">Nota Fiscal</th>
                <th className="px-5 py-3 font-medium">Fornecedor</th>
                <th className="px-5 py-3 font-medium">Data</th>
                <th className="px-5 py-3 font-medium">Itens</th>
                {gestor && <th className="px-5 py-3 font-medium">Valor Total</th>}
              </tr>
            </thead>
            <tbody>
              {entradas.length === 0 ? (
                <tr>
                  <td colSpan={gestor ? 5 : 4} className="px-5 py-10 text-center text-muted">
                    <ArrowDownToLine className="mx-auto mb-2 h-8 w-8 opacity-50" />
                    Nenhuma entrada registrada.
                  </td>
                </tr>
              ) : (
                entradas.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-medium text-ink">
                      <span className="inline-flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-muted" /> {e.nota}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <Truck className="h-4 w-4" /> {e.fornecedor}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted">{e.data}</td>
                    <td className="px-5 py-3 text-ink">{e.itens}</td>
                    {gestor && (
                      <td className="px-5 py-3 font-medium text-ink">
                        {moedaBR(e.valorTotal)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
