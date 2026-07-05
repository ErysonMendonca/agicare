"use client";

import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "./ui";
import type { ProdutoCompleto } from "../../types";
import { Lock } from "lucide-react";

export function EstoqueFinanceiro({
  produto,
  gestor,
}: {
  produto: ProdutoCompleto;
  gestor: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Estoque */}
      <Card className="p-5">
        <SectionTitle>Estoque (Geral)</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            id="pr-min"
            name="min_quantity"
            type="number"
            min={0}
            step="any"
            label="Estoque Mínimo"
            defaultValue={String(produto.minQuantity ?? 0)}
          />
          <Input
            id="pr-max"
            name="max_quantity"
            type="number"
            min={0}
            step="any"
            label="Estoque Máximo"
            defaultValue={String(produto.maxQuantity ?? 0)}
          />
          <Input
            id="pr-loc"
            name="location"
            label="Localização Física Padrão"
            placeholder="Ex.: Prateleira A1"
            defaultValue={produto.location ?? ""}
          />
        </div>
      </Card>

      {/* Financeiro */}
      <Card className="p-5">
        <SectionTitle>Financeiro</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gestor ? (
            <>
              <Input
                id="pr-cost"
                name="cost"
                type="number"
                min={0}
                step="0.01"
                label="Custo de Aquisição (R$)"
                defaultValue={String(produto.cost ?? 0)}
              />
              <Input
                id="pr-price"
                name="price"
                type="number"
                min={0}
                step="0.01"
                label="Preço de Venda (R$)"
                defaultValue={String(produto.price ?? 0)}
              />
            </>
          ) : (
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="flex items-center gap-2 rounded-lg border border-line bg-muted-surface px-3 py-2 text-xs text-muted">
                <Lock className="h-3.5 w-3.5" />
                Apenas gestores podem visualizar e editar custo e preço.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
