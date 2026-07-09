import { notFound } from "next/navigation";
import { requireView } from "@/lib/permissions";
import { PageHeader } from "@/components/app/PageHeader";
import { listAttendanceOptions } from "@/lib/data/attendance-options";
import { getProfessionalById } from "@/lib/data/professionals";
import { listCargos } from "@/lib/data/usuarios";
import { ProfissionalForm } from "../ProfissionalForm";
import { AdminForm } from "../AdminForm";

const PAPEIS_CLINICOS = ["medico", "enfermeiro", "enfermagem"];

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

  const options = await listAttendanceOptions();
  const especialidades = options["especialidade"] || [];
  const tiposProfissional = options["tipo_profissional"] || [];
  const departamentos = options["departamento"] || [];
  const cargos = await listCargos();

  const isAdmin = !PAPEIS_CLINICOS.includes(profissional.role);

  return (
    <>
      <div className="mb-4">
        <PageHeader
          title={isAdmin ? "Editar Administrativo" : "Editar Profissional"}
          subtitle="Atualize os dados do cadastro."
        />
      </div>
      {isAdmin ? (
        <AdminForm
          profissional={profissional}
          departamentos={departamentos}
          cargos={cargos}
        />
      ) : (
        <ProfissionalForm
          profissional={profissional}
          especialidades={especialidades}
          tiposProfissional={tiposProfissional}
        />
      )}
    </>
  );
}
