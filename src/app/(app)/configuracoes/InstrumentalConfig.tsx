"use client";

import { Wrench } from "lucide-react";
import type { CatalogoItem } from "@/lib/data/produto-catalogos";
import { CatalogoTabela } from "./CatalogoTabela";

/**
 * Catálogo PLANO de "Instrumental" (gestor). Reusa a tabela rica genérica
 * (busca, paginação, drag-reorder, CRUD via modal) sobre attendance_options na
 * category='instrumental'. Alimenta a etapa "Instrumental" do cadastro de
 * procedimento — catálogo reutilizável, SEM baixa de estoque.
 */
export function InstrumentalConfig({ itens }: { itens: CatalogoItem[] }) {
  return (
    <CatalogoTabela
      categoria="instrumental"
      titulo="Instrumental"
      descricao="Gerencie os instrumentais disponíveis para associar aos procedimentos (reutilizáveis, sem baixa de estoque)."
      substantivo="instrumental"
      icon={<Wrench className="h-4 w-4" />}
      itens={itens}
      placeholder="Ex.: Pinça anatômica"
    />
  );
}
