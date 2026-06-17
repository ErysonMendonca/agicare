import {
  Users,
  Stethoscope,
  Briefcase,
  CircleCheck,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { listProfessionals, isClinico } from "@/lib/data/professionals";
import { requireView } from "@/lib/permissions";
import { NovoProfissionalModal } from "./NovoProfissionalModal";
import { ProfissionaisLista } from "./ProfissionaisLista";

export default async function ProfissionaisPage() {
  await requireView("profissionais");
  const profissionais = await listProfessionals();

  // KPIs derivados dos dados.
  const total = profissionais.length;
  const ativos = profissionais.filter((p) => p.ativo).length;
  const clinica = profissionais.filter(isClinico).length;
  const administrativa = total - clinica;

  return (
    <>
      <PageHeader
        title="Profissionais"
        subtitle="Gestão de equipe clínica, administrativa e controle de acessos"
        actions={<NovoProfissionalModal triggerLabel="Novo Profissional" />}
      />

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FadeInUp>
          <StatCard
            icon={<Users className="h-5 w-5" />}
            value={String(total)}
            label="Total de Profissionais"
            tone="brand"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Stethoscope className="h-5 w-5" />}
            value={String(clinica)}
            label="Equipe Clínica"
            tone="blue"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Briefcase className="h-5 w-5" />}
            value={String(administrativa)}
            label="Equipe Administrativa"
            tone="purple"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<CircleCheck className="h-5 w-5" />}
            value={String(ativos)}
            label="Profissionais Ativos"
            tone="green"
          />
        </FadeInUp>
      </Stagger>

      {/* Abas funcionais + lista filtrável (estado no client). */}
      <ProfissionaisLista profissionais={profissionais} />
    </>
  );
}
