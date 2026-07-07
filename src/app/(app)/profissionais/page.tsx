import { PageHeader } from "@/components/app/PageHeader";
import { listProfessionals, isClinico } from "@/lib/data/professionals";
import { listAttendanceOptions } from "@/lib/data/attendance-options";
import { requireView } from "@/lib/permissions";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ProfissionaisLista } from "./ProfissionaisLista";

export default async function ProfissionaisPage() {
  await requireView("profissionais");
  const [profissionais, attendanceOptions] = await Promise.all([
    listProfessionals(),
    listAttendanceOptions(),
  ]);
  // Catálogo de especialidades (compartilhado com a ficha de atendimento).
  const especialidades = attendanceOptions.especialidade ?? [];

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
        actions={
          <Link
            href="/profissionais/novo"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Novo Profissional
          </Link>
        }
      />

      {/* KPIs clicáveis + abas funcionais + lista filtrável (estado no client). */}
      <ProfissionaisLista
        profissionais={profissionais}
        especialidades={especialidades}
        kpis={{ total, clinica, administrativa, ativos }}
      />
    </>
  );
}
