"use client";

import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { CheckboxGroup, SectionTitle } from "./ui";
import type { ProdutoCatalogos } from "@/lib/data/produto-catalogos";
import type { ProductXyzClass } from "../../types";

export function Selecoes({
  catalogos,
  selUnidades,
  setSelUnidades,
  selVias,
  setSelVias,
  selPrincipios,
  setSelPrincipios,
  selMarcas,
  setSelMarcas,
  selLocais,
  setSelLocais,
  selXyz,
  setSelXyz,
}: {
  catalogos: ProdutoCatalogos;
  selUnidades: string[];
  setSelUnidades: (v: string[]) => void;
  selVias: string[];
  setSelVias: (v: string[]) => void;
  selPrincipios: string[];
  setSelPrincipios: (v: string[]) => void;
  selMarcas: string[];
  setSelMarcas: (v: string[]) => void;
  selLocais: string[];
  setSelLocais: (v: string[]) => void;
  selXyz: ProductXyzClass | "";
  setSelXyz: (v: ProductXyzClass | "") => void;
}) {
  const optUnidades = catalogos.unidade_medida?.map(c => c.label) || [];
  const optVias = catalogos.via_administracao?.map(c => c.label) || [];
  const optPrincipios = catalogos.principio_ativo?.map(c => c.label) || [];
  const optMarcas = catalogos.marca?.map(c => c.label) || [];
  const optLocais = catalogos.localizacao?.map(c => c.label) || [];
  const optXyz = catalogos.classificacao_xyz?.filter((o) => o.active) || [];

  return (
    <Card className="p-5">
      <SectionTitle>Seleções</SectionTitle>
      <p className="-mt-2 mb-4 text-xs text-muted">
        Marque os itens que se aplicam a este produto. As opções são geridas
        nos catálogos em Configurações.
      </p>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        <CheckboxGroup
          legend="Unidade de Medida"
          options={optUnidades}
          selected={selUnidades}
          onChange={setSelUnidades}
        />
        <CheckboxGroup
          legend="Via de Administração"
          options={optVias}
          selected={selVias}
          onChange={setSelVias}
        />
        <CheckboxGroup
          legend="Princípio Ativo"
          options={optPrincipios}
          selected={selPrincipios}
          onChange={setSelPrincipios}
        />
        <CheckboxGroup
          legend="Marca"
          options={optMarcas}
          selected={selMarcas}
          onChange={setSelMarcas}
        />
        <CheckboxGroup
          legend="Localização para Requisição"
          options={optLocais}
          selected={selLocais}
          onChange={setSelLocais}
        />
        <div>
          <Select
            id="pr-xyz"
            label="Classificação XYZ"
            value={selXyz}
            onChange={(e) => setSelXyz(e.target.value as ProductXyzClass | "")}
          >
            <option value="">Sem classificação</option>
            {optXyz.map((o) => (
              <option key={o.id} value={o.label}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Card>
  );
}
