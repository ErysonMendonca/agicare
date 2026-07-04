"use client";

import { useState } from "react";
import {
  Ruler,
  Syringe,
  FlaskConical,
  Tag,
  MapPin,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { CatalogoTabela } from "./CatalogoTabela";
import type {
  ProdutoCatalogos,
  ProdutoCatalogoCategory,
} from "@/lib/data/produto-catalogos";

/** Metadados de exibição de cada catálogo do produto. */
const CATALOGOS: {
  categoria: ProdutoCatalogoCategory;
  titulo: string;
  descricao: string;
  substantivo: string;
  placeholder: string;
  icon: LucideIcon;
}[] = [
  {
    categoria: "unidade_medida",
    titulo: "Unidade de Medida",
    descricao: "Unidades usadas no cadastro e movimentação de produtos.",
    substantivo: "unidade de medida",
    placeholder: "Ex.: Comprimido (COMP)",
    icon: Ruler,
  },
  {
    categoria: "via_administracao",
    titulo: "Via de Administração",
    descricao: "Vias pelas quais o medicamento é administrado.",
    substantivo: "via de administração",
    placeholder: "Ex.: Intravenosa (IV)",
    icon: Syringe,
  },
  {
    categoria: "principio_ativo",
    titulo: "Princípio Ativo",
    descricao: "Substâncias ativas dos produtos.",
    substantivo: "princípio ativo",
    placeholder: "Ex.: Dipirona",
    icon: FlaskConical,
  },
  {
    categoria: "marca",
    titulo: "Marca",
    descricao: "Fabricantes / marcas dos produtos.",
    substantivo: "marca",
    placeholder: "Ex.: EMS",
    icon: Tag,
  },
  {
    categoria: "localizacao",
    titulo: "Localização",
    descricao: "Locais de armazenamento no estoque.",
    substantivo: "localização",
    placeholder: "Ex.: Prateleira A1",
    icon: MapPin,
  },
  {
    categoria: "classificacao_xyz",
    titulo: "Classificação XYZ",
    descricao: "Criticidade do item (X, Y, Z).",
    substantivo: "classificação",
    placeholder: "Ex.: X",
    icon: Layers,
  },
];

/**
 * Gestão dos catálogos do cadastro de produto (gestor-only). Cada catálogo é
 * uma tabela rica (CatalogoTabela); um seletor de sub-abas alterna entre os 6.
 */
export function ProdutoCatalogosConfig({
  catalogos,
}: {
  catalogos: ProdutoCatalogos;
}) {
  const [ativo, setAtivo] = useState<ProdutoCatalogoCategory>(
    CATALOGOS[0].categoria,
  );

  const meta = CATALOGOS.find((c) => c.categoria === ativo) ?? CATALOGOS[0];
  const Icon = meta.icon;

  return (
    <div className="space-y-5">
      {/* Sub-abas dos catálogos */}
      <div
        role="tablist"
        aria-label="Catálogos do produto"
        className="flex flex-wrap gap-2"
      >
        {CATALOGOS.map((c) => {
          const CIcon = c.icon;
          const selecionado = c.categoria === ativo;
          return (
            <button
              key={c.categoria}
              type="button"
              role="tab"
              aria-selected={selecionado}
              onClick={() => setAtivo(c.categoria)}
              className={
                selecionado
                  ? "inline-flex items-center gap-2 rounded-full bg-brand-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm"
                  : "inline-flex items-center gap-2 rounded-full border border-line px-4 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-ink"
              }
            >
              <CIcon className="h-4 w-4" />
              {c.titulo}
            </button>
          );
        })}
      </div>

      <CatalogoTabela
        key={meta.categoria}
        categoria={meta.categoria}
        titulo={meta.titulo}
        descricao={meta.descricao}
        substantivo={meta.substantivo}
        placeholder={meta.placeholder}
        icon={<Icon className="h-5 w-5" />}
        itens={catalogos[meta.categoria] ?? []}
      />
    </div>
  );
}
