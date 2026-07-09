import { requireRole } from "@/lib/auth";
import { getPermissionMatrix } from "@/lib/permissions";
import { listCargos } from "@/lib/data/usuarios";
import { PermissoesClient } from "./PermissoesClient";

export default async function PermissoesPage() {
  // Gate server-side: somente admin acessa Perfis de Acesso. Diferente dos
  // demais módulos, este NÃO é concedível pela matriz — a RLS de
  // `role_permissions` (policy write-admin, 0021) só autoriza o admin a gravar,
  // e é a última barreira contra escalada de privilégio. Liberar a tela sem
  // afrouxar a policy daria um botão "Salvar" que sempre falha.
  await requireRole("admin");

  const [matrix, cargos] = await Promise.all([
    getPermissionMatrix(),
    listCargos(),
  ]);

  return <PermissoesClient initialRows={matrix} cargos={cargos} />;
}
