import { isGestor } from "@/lib/auth";
import { requireView } from "@/lib/permissions";
import {
  getRelatoriosData,
  getUtilizacaoAtendimentoBI,
} from "@/lib/data/relatorios";
import { listAttendanceOptions } from "@/lib/data/attendance-options";
import { parseRelatoriosFiltros } from "@/lib/data/relatorios-filtros";
import { listProfessionals } from "@/lib/data/professionals";
import { getAccessLogs, getConsentLogs } from "@/lib/data/audit";
import {
  getTempoEsperaBI,
  getTempoEsperaSemanaBI,
  getOrigemPacientesBI,
  getEpidemiologicoBI,
  getFinanceiroBI,
} from "@/lib/data/bi";
import { RelatoriosClient } from "./RelatoriosClient";

export default async function RelatoriosPage({
  searchParams,
}: {
  // Next.js 16: searchParams é assíncrono.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireView("relatorios");
  // Gate no servidor: o booleano `gestor` decide ANTES da agregação se os
  // dados financeiros são sequer calculados/serializados (LGPD/estratégico).
  const gestor = await isGestor();

  // Filtros vêm da URL (searchParams) → afetam DE VERDADE as consultas abaixo.
  const filtros = parseRelatoriosFiltros(await searchParams);

  // Profissionais reais para popular os selects de filtro (id + especialidade).
  const profissionais = await listProfessionals();
  const opcoesProfissionais = profissionais.map((p) => ({
    id: p.id,
    nome: p.nome,
  }));
  const [
    data,
    tempoEspera,
    tempoEsperaSemana,
    origem,
    epidemio,
    financeiroBI,
    utilizacao,
    opcoesAtendimento,
  ] = await Promise.all([
    getRelatoriosData(gestor, filtros),
    getTempoEsperaBI(filtros),
    getTempoEsperaSemanaBI(filtros),
    getOrigemPacientesBI(filtros),
    getEpidemiologicoBI(filtros),
    // Financeiro (BI) só é calculado/serializado para gestor (gate no servidor).
    getFinanceiroBI(gestor, filtros),
    getUtilizacaoAtendimentoBI(filtros),
    // Opções parametrizadas: cruzadas com o BI para apontar as "sem uso".
    listAttendanceOptions(),
  ]);

  // Filtro de especialidade: catálogo (attendance_options) unido às
  // especialidades já presentes nos profissionais (legado), sem duplicar.
  const opcoesEspecialidades = [
    ...new Set([
      ...(opcoesAtendimento.especialidade ?? []).map((e) => e.value),
      ...profissionais.map((p) => p.especialidade).filter((e) => e && e !== "—"),
    ]),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  // Auditoria (Conformidade LGPD): trilha só é lida/serializada para gestor.
  // Para não-gestor as listas saem vazias e nem chegam ao payload do client.
  const [accessLogs, consentLogs] = gestor
    ? await Promise.all([getAccessLogs({ limit: 200 }), getConsentLogs()])
    : [[], []];

  return (
    <RelatoriosClient
      gestor={gestor}
      data={data}
      accessLogs={accessLogs}
      consentLogs={consentLogs}
      tempoEspera={tempoEspera}
      tempoEsperaSemana={tempoEsperaSemana}
      origem={origem}
      epidemio={epidemio}
      financeiroBI={financeiroBI}
      utilizacao={utilizacao}
      opcoesAtendimento={opcoesAtendimento}
      filtros={filtros}
      opcoesProfissionais={opcoesProfissionais}
      opcoesEspecialidades={opcoesEspecialidades}
    />
  );
}
