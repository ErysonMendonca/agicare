import { requireView } from "@/lib/permissions";
import { listUsuarios, listCargos } from "@/lib/data/usuarios";
import { UsuariosSection } from "../permissoes/UsuariosSection";
import { PageHeader } from "@/components/app/PageHeader";

export default async function UsuariosPage() {
  // Gate server-side pela matriz de permissões (admin sempre passa). Quem não
  // pode ver o módulo é redirecionado para /dashboard.
  await requireView("usuarios");

  const [usuarios, cargos] = await Promise.all([
    listUsuarios(),
    listCargos(),
  ]);

  return (
    <>
      <div className="mb-6">
        <PageHeader
          title="Gestão de Usuários"
          subtitle="Gerencie as credenciais, senhas e cargos dos usuários do sistema."
        />
      </div>
      <UsuariosSection usuarios={usuarios} cargos={cargos} />
    </>
  );
}
