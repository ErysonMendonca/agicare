import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/PageHeader";
import { requireView } from "@/lib/permissions";
import { isGestor } from "@/lib/auth";
import { listProductCategories } from "@/lib/data/product-categories";
import { ImportarProdutosClient } from "./ImportarProdutosClient";

export default async function ImportarProdutosPage() {
  // Acesso ao módulo estoque (permissões) + gate de GESTOR: importação em
  // massa é ação administrativa. Não-gestor volta para /estoque.
  await requireView("estoque");
  const [gestor, categorias] = await Promise.all([
    isGestor(),
    listProductCategories(),
  ]);
  if (!gestor) redirect("/estoque");

  return (
    <>
      <PageHeader
        title="Importar Produtos (Excel)"
        subtitle="Baixe o modelo, preencha, suba a planilha e classifique cada produto antes de salvar em massa"
      />
      <ImportarProdutosClient categorias={categorias} />
    </>
  );
}
