"use client";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import type { AttendanceOptionsByCategory } from "@/lib/data/attendance-options.shared";
import type { ProdutoCompleto } from "../types";

export function ProdutoBasico({
  produto,
  options,
}: {
  produto: ProdutoCompleto;
  options: AttendanceOptionsByCategory;
}) {
  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-lg font-semibold mb-4">Informações Básicas</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="Nome do Produto / Medicamento *"
          name="name"
          defaultValue={produto.name}
          required
        />
        <Select
          label="Tipo de Produto"
          name="product_type"
          defaultValue={produto.productType || ""}
        >
          <option value="">Selecione...</option>
          {options.tipo_produto?.map((o) => (
            <option key={o.id} value={o.value}>{o.label}</option>
          ))}
        </Select>
        <Select
          label="Categoria"
          name="category"
          defaultValue={produto.category || ""}
        >
          <option value="">(Herda do Tipo)</option>
          <option value="Medicamento">Medicamento</option>
          <option value="Material">Material</option>
        </Select>
        <Input
          label="Unidade (Principal)"
          name="unit"
          defaultValue={produto.unit || "un"}
        />
        <Input
          label="Marca / Fabricante"
          name="manufacturer"
          defaultValue={produto.manufacturer || ""}
        />
        <Input
          label="Código de Barras (EAN)"
          name="barcode"
          defaultValue={produto.barcode || ""}
        />
      </div>
    </Card>
  );
}
