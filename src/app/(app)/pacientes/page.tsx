import { Users } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { NovoPacienteButton } from "./NovoPacienteButton";
import { PacientesClient } from "./PacientesClient";
import { listPatients } from "@/lib/data/patients";
import { requireView } from "@/lib/permissions";

export default async function PacientesPage() {
  await requireView("pacientes");

  // Fetch no servidor (RLS/cookies); a busca, o filtro de status, a exportação
  // CSV e o stub do CadSUS rodam no client sobre os dados passados via props.
  const pacientes = await listPatients();
  const total = pacientes.length;
  const ativos = pacientes.filter((p) => p.ativo).length;
  const comAlergias = pacientes.filter((p) => p.alergia).length;
  const emTratamento = pacientes.filter((p) => p.emTratamento).length;

  return (
    <>
      <PageHeader
        title="Cadastro de Pacientes"
        subtitle="Gerencie os dados completos dos pacientes da clínica"
        actions={<NovoPacienteButton />}
      />

      {total === 0 ? (
        // Nenhum paciente cadastrado ainda: não faz sentido mostrar busca/filtros
        // nem a tabela. (Filtro-vazio com pacientes existentes é tratado dentro
        // do PacientesClient.)
        <EmptyState
          icon={Users}
          title="Nenhum paciente encontrado"
          description="Ainda não há pacientes cadastrados nesta clínica. Cadastre o primeiro para começar."
          action={<NovoPacienteButton />}
          className="mt-6 rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]"
        />
      ) : (
        <PacientesClient
          pacientes={pacientes}
          kpis={{ total, ativos, comAlergias, emTratamento }}
        />
      )}
    </>
  );
}
