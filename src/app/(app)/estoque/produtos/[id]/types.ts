// ════════════════════════════════════════════════════════════════
// Contrato de tipos do EDITOR DE PRODUTO (cadastro completo, grau farmácia).
//
//   • ProdutoCompleto (produto-mestre, camelCase) — owner: Marina (frontend).
//   • Tipos das 7 tabelas-filhas + ProdutoChildren — owner: Fael (./tabs/types).
//     Reexportados aqui para o page.tsx/ProdutoEditor consumirem de um só lugar.
//
// getProdutoCompleto(id) → ProdutoCompleto | null   (backend, data/stock.ts)
// getProdutoChildren(id) → ProdutoChildren          (backend, data/stock-product-children.ts)
// ════════════════════════════════════════════════════════════════

import type { AttendanceOptionsByCategory } from "@/lib/data/attendance-options.shared";

// Produto-mestre: tipo é FONTE DA VERDADE do backend (data/stock.ts), retornado
// por getProdutoCompleto(). Reexportado aqui para uso do shell/editor.
export type { ProdutoCompleto } from "@/lib/data/stock";

// Tipos das 7 tabelas-filhas + ProdutoChildren: FONTE DA VERDADE é o backend
// (data/stock-product-children.ts). Reexportados aqui para a UI consumir de um
// só lugar.
export type {
  ProductUnit,
  ProductMinMax,
  ProductAdminRoute,
  ProductActiveIngredient,
  ProductBrand,
  ProductRequisitionLocation,
  ProductXyz,
  ProductXyzClass,
  ProdutoChildren,
} from "@/lib/data/stock-product-children";

/**
 * Props comuns de uma aba-filha do editor: o id do produto (já salvo) + a lista
 * atual daquela coleção. `options` é o catálogo (attendance_options) — usado só
 * pelas abas com select de catálogo (Unidade, Via, Princípio Ativo, Marca).
 */
export type ChildTabProps<T> = {
  productId: string;
  data: T[];
  options?: AttendanceOptionsByCategory;
};
