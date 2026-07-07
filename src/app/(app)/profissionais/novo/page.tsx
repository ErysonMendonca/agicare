import { requireView } from "@/lib/permissions";
import { PageHeader } from "@/components/app/PageHeader";
import { listAttendanceOptions } from "@/lib/data/attendance-options";
import { ProfissionalForm } from "../ProfissionalForm";

export default async function NovoProfissionalPage() {
  await requireView("profissionais");

  const options = await listAttendanceOptions();
  const especialidades = options["especialidade"] || [];
  const tiposProfissional = options["tipo_profissional"] || [];

  return (
    <>
      <div className="mb-4">
        <PageHeader
          title="Novo Profissional"
          subtitle="Preencha os dados abaixo para cadastrar um novo profissional."
        />
      </div>
      <ProfissionalForm
        especialidades={especialidades}
        tiposProfissional={tiposProfissional}
      />
    </>
  );
}
