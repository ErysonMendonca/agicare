import { Activity, ClipboardCheck, Droplets, HeartPulse } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { listPatients } from "@/lib/data/patients";
import {
  listSinaisVitais,
  listAnotacoes,
  listCuidados,
  getBalancoHidrico,
  listEvolucoes,
  listEscalas,
  listProcedimentosEnfermagem,
  listSae,
  nextAnotacaoCode,
  type OpcaoPaciente,
} from "@/lib/data/enfermagem";
import { requireView } from "@/lib/permissions";
import { EnfermagemClient } from "./EnfermagemClient";

export default async function EnfermagemPage() {
  await requireView("enfermagem");
  const [
    pacientes,
    sinais,
    anotacoes,
    cuidados,
    balanco,
    evolucoes,
    escalas,
    procedimentos,
    sae,
    proximoCodigo,
  ] = await Promise.all([
    listPatients(),
    listSinaisVitais(),
    listAnotacoes(),
    listCuidados(),
    getBalancoHidrico(),
    listEvolucoes(),
    listEscalas(),
    listProcedimentosEnfermagem(),
    listSae(),
    nextAnotacaoCode(),
  ]);

  const opcoesPacientes: OpcaoPaciente[] = pacientes.map((p) => ({
    id: p.id,
    nome: p.nome,
  }));

  // KPIs reais derivados dos dados.
  const cuidadosPendentes = cuidados.filter(
    (c) => c.statusRaw === "pendente",
  ).length;
  const saldoHidrico = balanco?.saldo ?? 0;

  return (
    <>
      <PageHeader
        title="Enfermagem"
        subtitle="Assistência de enfermagem: sinais vitais, cuidados, balanço hídrico e SAE"
      />

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FadeInUp>
          <StatCard
            icon={<HeartPulse className="h-5 w-5" />}
            value={String(sinais.length)}
            label="Aférições Registradas"
            tone="neutral"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<ClipboardCheck className="h-5 w-5" />}
            value={String(cuidadosPendentes)}
            label="Cuidados Pendentes"
            tone="warn"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Droplets className="h-5 w-5" />}
            value={`${saldoHidrico > 0 ? "+" : ""}${saldoHidrico} ml`}
            label="Saldo Hídrico (24h)"
            tone={saldoHidrico >= 0 ? "success" : "warn"}
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Activity className="h-5 w-5" />}
            value={String(sae.length)}
            label="Diagnósticos SAE"
            tone="neutral"
          />
        </FadeInUp>
      </Stagger>

      <EnfermagemClient
        pacientes={opcoesPacientes}
        sinais={sinais}
        anotacoes={anotacoes}
        proximoCodigo={proximoCodigo}
        cuidados={cuidados}
        balanco={balanco}
        evolucoes={evolucoes}
        escalas={escalas}
        procedimentos={procedimentos}
        sae={sae}
      />
    </>
  );
}
