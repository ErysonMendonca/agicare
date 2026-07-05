"use client";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Checkbox, Toggle, SectionTitle } from "./ui";
import type { ProdutoCompleto } from "../types";
import type { AttendanceOptionsByCategory } from "@/lib/data/attendance-options.shared";

export function DadosGerais({
  produto,
  options,
  novo,
  ativo,
  setAtivo,
}: {
  produto: ProdutoCompleto;
  options: AttendanceOptionsByCategory;
  novo: boolean;
  ativo: boolean;
  setAtivo: (v: boolean) => void;
}) {
  const tipos = options.tipo_produto || [];
  const grupos = options.grupo_produto || [];

  return (
    <div className="space-y-4">
      {/* Dados Básicos */}
      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Código
            </span>
            <span className="inline-flex h-10 w-full items-center gap-2 rounded-lg bg-brand-50 px-3 text-sm font-semibold text-brand-600">
              {novo ? (
                <>
                  AUTO
                  <span className="text-xs font-normal text-muted">
                    gerado ao salvar
                  </span>
                </>
              ) : (
                produto.codigo || "—"
              )}
            </span>
          </div>
          <div className="flex items-end">
            <Toggle label="Ativo" checked={ativo} onChange={setAtivo} />
          </div>
          <Input
            id="pr-nome"
            name="name"
            label="Descrição *"
            placeholder="Ex.: Dipirona Sódica 500mg/mL"
            required
            defaultValue={produto.name}
            className="sm:col-span-2 lg:col-span-2"
          />
        </div>
      </Card>

      {/* Classificação */}
      <Card className="p-5">
        <SectionTitle>Classificação</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            id="pr-tipo"
            name="product_type"
            label="Tipo de Produto"
            defaultValue={produto.productType ?? ""}
          >
            <option value="">Selecione</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.label}>{t.label}</option>
            ))}
          </Select>
          <Select
            id="pr-grupo"
            name="product_group"
            label="Grupo"
            defaultValue={produto.productGroup ?? ""}
          >
            <option value="">Selecione</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.label}>{g.label}</option>
            ))}
          </Select>
          <Input
            id="pr-classif"
            name="classification"
            label="Classificação"
            defaultValue={produto.classification ?? ""}
          />
          <Input
            id="pr-subclassif"
            name="subclassification"
            label="Subclassificação"
            defaultValue={produto.subclassification ?? ""}
          />
          <Input
            id="pr-ncm"
            name="ncm"
            label="NCM"
            placeholder="Ex.: 3004.90.69"
            defaultValue={produto.ncm ?? ""}
          />
          <Input
            id="pr-cfop"
            name="cfop"
            label="CFOP"
            placeholder="Ex.: 5405"
            defaultValue={produto.cfop ?? ""}
          />
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <Checkbox
              name="port_344"
              label="Port. 344/98"
              defaultChecked={produto.port344}
            />
          </div>
        </div>
      </Card>
      
      {/* Controle */}
      <Card className="p-5">
        <SectionTitle>Controle</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <Checkbox name="ctrl_lote_validade" label="Lote e Validade" defaultChecked={produto.ctrlLoteValidade} />
          <Checkbox name="ctrl_opme" label="OPME" defaultChecked={produto.ctrlOpme} />
          <Checkbox name="ctrl_numero_serie" label="Número Série" defaultChecked={produto.ctrlNumeroSerie} />
          <Checkbox name="ctrl_marca" label="Marca" defaultChecked={produto.ctrlMarca} />
        </div>
      </Card>
    </div>
  );
}
