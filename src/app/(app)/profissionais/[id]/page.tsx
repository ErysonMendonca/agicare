import { notFound } from "next/navigation";
import { requireView } from "@/lib/permissions";
import { PageHeader } from "@/components/app/PageHeader";
import { getAttendanceOptions } from "@/lib/data/attendance-options";
import { listEspecialidades } from "@/lib/data/especialidades";
import { getProfessionalById } from "@/lib/data/professionals";
import { ProfissionalForm } from "../ProfissionalForm";

export default async function EditarProfissionalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireView("profissionais");

  const { id } = await params;
  const profissional = await getProfessionalById(id);

  if (!profissional) {
    notFound();
  }

  const [options, especialidades] = await Promise.all([
    getAttendanceOptions(),
    listEspecialidades(),
  ]);

  const tiposProfissional = options["tipo_profissional"] || [];

  return (
    <>
      <div className="mb-4">
        <PageHeader
          title="Editar Profissional"
          subtitle="Atualize os dados do profissional cadastrado."
        />
      </div>
      <ProfissionalForm
        profissional={profissional || undefined}
        especialidades={especialidades}
        tiposProfissional={tiposProfissional}
      />
    </>
  );
}
