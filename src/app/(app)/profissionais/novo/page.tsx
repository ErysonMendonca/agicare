import { requireView } from "@/lib/permissions";
import { PageHeader } from "@/components/app/PageHeader";
import { listAttendanceOptions } from "@/lib/data/attendance-options";
import { listEspecialidades } from "@/lib/data/especialidades";
import { ProfissionalForm } from "../ProfissionalForm";

export default async function NovoProfissionalPage() {
  await requireView("profissionais");

  const [options, especialidades] = await Promise.all([
    listAttendanceOptions(),
    listEspecialidades(),
  ]);

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
