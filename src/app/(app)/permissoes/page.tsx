import { requireRole } from "@/lib/auth";
import { getPermissionMatrix } from "@/lib/permissions";
import { listUsuarios, listCargos } from "@/lib/data/usuarios";
import { PermissoesClient } from "./PermissoesClient";

export default async function PermissoesPage() {
  // Gate server-side: somente admin acessa Perfis de Acesso.
  await requireRole("admin");

  const [matrix, usuarios, cargos] = await Promise.all([
    getPermissionMatrix(),
    listUsuarios(),
    listCargos(),
  ]);

  return (
    <PermissoesClient
      initialRows={matrix}
      usuarios={usuarios}
      cargos={cargos}
    />
  );
}
