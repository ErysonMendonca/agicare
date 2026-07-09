import { requireRole } from "@/lib/auth";
import { getPermissionMatrix } from "@/lib/permissions";
import { listCargos } from "@/lib/data/usuarios";
import { PermissoesClient } from "./PermissoesClient";

export default async function PermissoesPage() {
  // Gate server-side: somente admin acessa Perfis de Acesso.
  await requireRole("admin");

  const [matrix, cargos] = await Promise.all([
    getPermissionMatrix(),
    listCargos(),
  ]);

  return (
    <PermissoesClient
      initialRows={matrix}
      cargos={cargos}
    />
  );
}
