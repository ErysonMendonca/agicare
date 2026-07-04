// ════════════════════════════════════════════════════════════════
// PLACEHOLDER das abas-filhas — criado pela Marina (shell) para o editor
// compilar. Fael substitui cada arquivo pela implementação real.
//
// CONVENÇÃO (obrigatória — o shell chama exatamente assim):
//   export function XTab({ productId, data }: ChildTabProps<T>) { ... }
// Arquivos e tipos (ver ../types.ts):
//   UnidadesTab          data: ProductUnit[]
//   EstoqueMinMaxTab     data: ProductMinMax[]
//   ViasAdministracaoTab data: ProductAdminRoute[]
//   PrincipiosAtivosTab  data: ProductActiveIngredient[]
//   MarcasTab            data: ProductBrand[]
//   LocalizacoesTab      data: ProductRequisitionLocation[]
//   ClassificacaoXyzTab  data: ProductXyz[]
// ════════════════════════════════════════════════════════════════
import { Wrench } from "lucide-react";
import { Card } from "@/components/ui/Card";

export function PlaceholderTab({ nome }: { nome: string }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
      <Wrench className="h-6 w-6 text-muted" />
      <p className="text-sm font-medium text-ink">{nome}</p>
      <p className="text-xs text-muted">Aba em construção.</p>
    </Card>
  );
}
