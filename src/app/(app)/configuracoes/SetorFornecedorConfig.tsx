"use client";

import { Truck } from "lucide-react";
import type { CatalogoItem } from "@/lib/data/produto-catalogos";
import { CatalogoTabela } from "./CatalogoTabela";

/**
 * Catálogo PLANO de "Setor Fornecedor" (gestor). Reusa a tabela rica genérica
 * (busca, paginação, drag-reorder, CRUD via modal) sobre attendance_options na
 * category='setor_fornecedor'. Popula o Select do modal de Nova Solicitação.
 */
export function SetorFornecedorConfig({ itens }: { itens: CatalogoItem[] }) {
  return (
    <CatalogoTabela
      categoria="setor_fornecedor"
      titulo="Setor Fornecedor"
      descricao="Gerencie os setores fornecedores disponíveis na Solicitação de Produtos."
      substantivo="setor fornecedor"
      icon={<Truck className="h-4 w-4" />}
      itens={itens}
      placeholder="Ex.: Farmácia Satélite"
    />
  );
}
