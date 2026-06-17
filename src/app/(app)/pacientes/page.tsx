import { Users, Activity, AlertCircle, Link2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Users className="h-5 w-5" />}
          value={total}
          label="Total de Pacientes"
          tone="brand"
        />
        <StatCard
          icon={<Activity className="h-5 w-5" />}
          value={ativos}
          label="Pacientes Ativos"
          tone="green"
        />
        <StatCard
          icon={<AlertCircle className="h-5 w-5" />}
          value={comAlergias}
          label="Com Alergias"
          tone="orange"
        />
        <StatCard
          icon={<Link2 className="h-5 w-5" />}
          value={emTratamento}
          label="Em Tratamento"
          tone="purple"
        />
      </div>

      <PacientesClient pacientes={pacientes} />
    </>
  );
}
