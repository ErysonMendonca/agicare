import { requireRole } from "@/lib/auth";
import { getPermissionMatrix } from "@/lib/permissions";
import { PermissoesClient } from "./PermissoesClient";

export default async function PermissoesPage() {
  // Gate server-side: somente admin acessa Perfis de Acesso.
  await requireRole("admin");

  const matrix = await getPermissionMatrix();

  return <PermissoesClient initialRows={matrix} />;
}
