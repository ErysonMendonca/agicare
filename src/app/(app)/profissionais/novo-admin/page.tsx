import { requireView } from "@/lib/permissions";
import { PageHeader } from "@/components/app/PageHeader";
import { listAttendanceOptions } from "@/lib/data/attendance-options";
import { listCargos } from "@/lib/data/usuarios";
import { AdminForm } from "../AdminForm";

export default async function NovoAdministrativoPage() {
  await requireView("profissionais");

  const options = await listAttendanceOptions();
  const departamentos = options["departamento"] || [];
  const cargos = await listCargos();

  return (
    <>
      <div className="mb-4">
        <PageHeader
          title="Novo Administrativo"
          subtitle="Preencha os dados abaixo para cadastrar um novo membro da equipe administrativa."
        />
      </div>
      <AdminForm departamentos={departamentos} cargos={cargos} />
    </>
  );
}
