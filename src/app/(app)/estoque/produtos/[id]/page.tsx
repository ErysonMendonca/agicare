import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/PageHeader";
import { requireView } from "@/lib/permissions";
import { isGestor } from "@/lib/auth";
import { getActiveClinicId, getMyClinics } from "@/lib/tenant";
import { listAttendanceOptions } from "@/lib/data/attendance-options";
import { listProdutoCatalogos } from "@/lib/data/produto-catalogos";
import { getProdutoCompleto, type ProdutoCompleto } from "@/lib/data/stock";
import { getProdutoChildren } from "@/lib/data/stock-product-children";
import { ProdutoEditor } from "./ProdutoEditor";
import type { ProdutoChildren } from "./types";

/** Produto vazio para o modo "novo" (defaults espelham a migration 0080). */
function produtoVazio(): ProdutoCompleto {
  return {
    id: "",
    codigo: "",
    name: "",
    activeIngredient: null,
    presentation: null,
    barcode: null,
    anvisaRegistration: null,
    category: null,
    therapeuticClass: null,
    unit: "un",
    controlledClass: null,
    requiresPrescription: false,
    manufacturer: null,
    supplierId: null,
    active: true,
    notes: null,
    quantity: 0,
    minQuantity: 0,
    maxQuantity: 0,
    location: null,
    lot: null,
    expiry: null,
    cost: 0,
    price: 0,
    productType: null,
    productGroup: null,
    classification: null,
    subclassification: null,
    port344: false,
    cfop: null,
    ncm: null,
    cest: null,
    ctrlLoteValidade: false,
    ctrlOpme: false,
    ctrlNumeroSerie: false,
    ctrlMarca: false,
    prescQualquerVia: false,
    prescQualquerFrequencia: false,
    prescSeNecessario: false,
    solicitaSeNecessario: null,
    salPrincipioAtivo: null,
    infoAltoCusto: false,
    infoAltoRisco: false,
    infoUrgencia: false,
    infoOncologia: false,
    infoAntimicrobianoRestrito: false,
    infoDva: false,
    infoUsoContinuo: false,
    infoNaoPadrao: false,
    solComponenteDiluido: false,
    solComponenteDiluente: false,
  };
}

export default async function ProdutoEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireView("estoque");
    const { id } = await params;
    const novo = id === "novo";

    const [gestor, options, catalogos, clinicId, clinicas] = await Promise.all([
      isGestor(),
      listAttendanceOptions(),
      listProdutoCatalogos(),
      getActiveClinicId(),
      getMyClinics(),
    ]);

    const empresa =
      clinicas.find((c) => c.id === clinicId)?.name ?? clinicas[0]?.name ?? "—";

    let produto: ProdutoCompleto;
    let children: ProdutoChildren | null = null;

    if (novo) {
      produto = produtoVazio();
    } else {
      const [p, ch] = await Promise.all([
        getProdutoCompleto(id),
        getProdutoChildren(id),
      ]);
      if (!p) notFound();
      produto = p;
      children = ch;
    }

    return (
      <>
        <PageHeader
          title={novo ? "Novo Produto" : `Produto ${produto.codigo || ""}`.trim()}
          subtitle="Cadastro completo do produto/medicamento no catálogo da clínica"
        />
        <ProdutoEditor
          novo={novo}
          empresa={empresa}
          produto={produto}
          childrenData={children}
          options={options}
          catalogos={catalogos}
          gestor={gestor}
        />
      </>
    );
  } catch (err: any) {
    if (err.message && err.message === 'NEXT_REDIRECT') throw err; // Allow Next.js redirects to bubble
    return (
      <div style={{ padding: 20, background: 'red', color: 'white' }}>
        <h2>SSR CRASH IN ProdutoEditorPage</h2>
        <pre>{err.message || String(err)}</pre>
        <pre>{err.stack}</pre>
      </div>
    );
  }
}
