"use client";

import { useState } from "react";
import {
  Ruler,
  Syringe,
  FlaskConical,
  Tag,
  MapPin,
  Layers,
  FolderTree,
  type LucideIcon,
} from "lucide-react";
import { CatalogoTabela } from "./CatalogoTabela";
import { CategoriasProdutoConfig } from "./CategoriasProdutoConfig";
import type { ProductCategoryNode } from "@/lib/data/product-categories";
import type {
  ProdutoCatalogos,
  ProdutoCatalogoCategory,
} from "@/lib/data/produto-catalogos";

/**
 * A árvore de categorias (0105) NÃO vive em attendance_options, então ela ganha
 * uma aba própria identificada por este sentinela. O estado da sub-aba é a
 * união dele com as categorias de attendance_options — assim o TS continua
 * garantindo que `catalogos[ativo]` só é acessado quando `ativo` é uma delas.
 */
const ABA_CATEGORIAS = "categorias" as const;

type AbaProduto = ProdutoCatalogoCategory | typeof ABA_CATEGORIAS;

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

/** Pills renderizadas: Categorias (árvore) primeiro, depois os 6 catálogos. */
const PILLS: { chave: AbaProduto; titulo: string; icon: LucideIcon }[] = [
  { chave: ABA_CATEGORIAS, titulo: "Categorias", icon: FolderTree },
  ...CATALOGOS.map((c) => ({
    chave: c.categoria as AbaProduto,
    titulo: c.titulo,
    icon: c.icon,
  })),
];

/**
 * Gestão dos catálogos do cadastro de produto (gestor-only). "Categorias" é a
 * árvore de 3 níveis (CategoriasProdutoConfig); os demais são tabelas ricas
 * (CatalogoTabela). Um seletor de sub-abas alterna entre eles.
 */
export function ProdutoCatalogosConfig({
  catalogos,
  categorias,
}: {
  catalogos: ProdutoCatalogos;
  categorias: ProductCategoryNode[];
}) {
  const [ativo, setAtivo] = useState<AbaProduto>(ABA_CATEGORIAS);

  // Só resolvemos os metadados de CatalogoTabela quando a aba NÃO é a árvore.
  const meta =
    ativo === ABA_CATEGORIAS
      ? null
      : (CATALOGOS.find((c) => c.categoria === ativo) ?? CATALOGOS[0]);
  const Icon = meta?.icon;

  return (
    <div className="space-y-5">
      {/* Sub-abas dos catálogos */}
      <div
        role="tablist"
        aria-label="Catálogos do produto"
        className="flex flex-wrap gap-2"
      >
        {PILLS.map((c) => {
          const CIcon = c.icon;
          const selecionado = c.chave === ativo;
          return (
            <button
              key={c.chave}
              type="button"
              role="tab"
              aria-selected={selecionado}
              onClick={() => setAtivo(c.chave)}
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

      {meta === null || Icon === undefined ? (
        <CategoriasProdutoConfig categorias={categorias} />
      ) : (
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
      )}
    </div>
  );
}
