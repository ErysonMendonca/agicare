import { Users, Activity, AlertCircle, Link2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { CadastroPacienteModal } from "./CadastroPacienteModal";
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
        actions={<CadastroPacienteModal />}
      />

      {total === 0 ? (
        // Nenhum paciente cadastrado ainda: não faz sentido mostrar busca/filtros
        // nem a tabela. (Filtro-vazio com pacientes existentes é tratado dentro
        // do PacientesClient.)
        <EmptyState
          icon={Users}
          title="Nenhum paciente encontrado"
          description="Ainda não há pacientes cadastrados nesta clínica. Cadastre o primeiro para começar."
          action={<CadastroPacienteModal />}
          className="mt-6 rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={<Users className="h-5 w-5" />}
              value={total}
              label="Total de Pacientes"
              tone="neutral"
            />
            <StatCard
              icon={<Activity className="h-5 w-5" />}
              value={ativos}
              label="Pacientes Ativos"
              tone="success"
            />
            <StatCard
              icon={<AlertCircle className="h-5 w-5" />}
              value={comAlergias}
              label="Com Alergias"
              tone="warn"
            />
            <StatCard
              icon={<Link2 className="h-5 w-5" />}
              value={emTratamento}
              label="Em Tratamento"
              tone="info"
            />
          </div>

          <PacientesClient pacientes={pacientes} />
        </>
      )}
    </>
  );
}
