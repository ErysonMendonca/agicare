import { PageHeader } from "@/components/app/PageHeader";
import { requireView } from "@/lib/permissions";
import { listAttendanceOptions } from "@/lib/data/attendance-options";
import { CadastroPacienteWizard } from "./CadastroPacienteWizard";

/**
 * Tela dedicada de cadastro de paciente (antes um modal). Wizard em 3 etapas
 * para melhor visualização ao preencher a ficha. O gate de acesso espelha o da
 * lista (/pacientes); a autorização real permanece no servidor + RLS.
 */
export default async function NovoPacientePage() {
  await requireView("pacientes");

  const opts = await listAttendanceOptions();
  const convenios = (opts.convenio ?? []).map((o) => o.value).filter(Boolean);
  const parentescos = (opts.parentesco ?? [])
    .map((o) => o.value)
    .filter(Boolean);

  return (
    <>
      <PageHeader
        title="Cadastro de Paciente"
        subtitle="Ficha completa em 3 etapas"
      />
      <div className="mt-6">
        <CadastroPacienteWizard
          convenios={convenios}
          parentescos={parentescos}
        />
      </div>
    </>
  );
}
