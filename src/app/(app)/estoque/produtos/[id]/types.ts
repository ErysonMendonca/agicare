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

// ── Dados das coleções de catálogos-filhos do produto ───────────────
export type {
  ProdutoCompleto,
  ProdutoChildren,
  ProductUnit,
  ProductMinMax,
  ProductAdminRoute,
  ProductActiveIngredient,
  ProductBrand,
  ProductRequisitionLocation,
  ProductXyzClass,
} from "@/lib/data/stock";

export type ProductPayload = {
  id?: string;
  active: boolean;
  name: string;
  category: string;
  productType: string;
  productGroup: string;
  unit: string;
  manufacturer: string;
  barcode: string;
  activeIngredient: string;
  presentation: string;
  controlledClass: string;
  requiresPrescription: boolean;
  anvisaRegistration: string;
  quantity: number;
  minQuantity: number;
  maxQuantity: number;
  location: string;
  lot: string;
  expiry: string;
  cost: number;
  price: number;
  ncm: string;
  cest: string;
  port344: boolean;
  ctrlLoteValidade: boolean;
  ctrlOpme: boolean;
  ctrlNumeroSerie: boolean;
  ctrlMarca: boolean;
  prescQualquerVia: boolean;
  prescQualquerFrequencia: boolean;
  prescSeNecessario: boolean;
  infoAltoCusto: boolean;
  infoAltoRisco: boolean;
  infoUrgencia: boolean;
  infoOncologia: boolean;
  infoAntimicrobianoRestrito: boolean;
  infoDva: boolean;
  infoUsoContinuo: boolean;
  infoNaoPadrao: boolean;
  solComponenteDiluido: boolean;
  solComponenteDiluente: boolean;
  // Children
  units: string[];
  routes: string[];
  ingredients: string[];
  brands: string[];
  locations: string[];
  xyzClass: string;
};

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
