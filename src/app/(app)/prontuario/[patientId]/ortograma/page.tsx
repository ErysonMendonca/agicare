import { redirect } from "next/navigation";
import { getRole } from "@/lib/auth";
import { getResumo } from "@/lib/data/prontuario";
import { getSettings } from "@/lib/data/settings";
import { getOrtogramaDoAtendimento, listOrtogramas } from "@/lib/data/ortograma";
import { getAtendimentoAtivo } from "@/lib/data/atendimento";
import { getProfissionalAtual } from "@/lib/data/profissional-atual";
import { SecaoClinica } from "../SecaoClinica";
import { OrtogramaClient } from "./OrtogramaClient";

/** Data/hora legível para o histórico. Formatada no servidor (evita divergir na hidratação). */
function formatarDataHora(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function formatarData(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

export default async function OrtogramaPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;

  // Gate de PAPEL, além do `requireView("prontuario")` do layout: a recepção
  // também tem esse módulo por default, e o ortograma é dado clínico (LGPD).
  // A RLS da 0103 já barraria a leitura das marcas, mas sem este redirect a
  // recepção abriria a tela e leria o cabeçalho do paciente.
  const role = await getRole();
  if (role !== "admin" && role !== "medico") redirect(`/prontuario/${patientId}`);

  // O atendimento em curso decide QUAL ortograma se edita: um por atendimento.
  const [resumo, settings, profissional, atendimento, historicoBruto] =
    await Promise.all([
      getResumo(patientId),
      getSettings(),
      getProfissionalAtual(),
      getAtendimentoAtivo(patientId),
      listOrtogramas(patientId),
    ]);

  const { atual, herdadoDe } = await getOrtogramaDoAtendimento(
    patientId,
    atendimento?.queueEntryId ?? null,
  );

  // Marcas partem do ortograma deste atendimento; se ele ainda não existe,
  // partem do último do paciente (estado dentário conhecido). `notes` NUNCA é
  // herdado — a observação livre pertence àquela consulta.
  const marcasIniciais = atual?.marcas ?? herdadoDe?.marcas ?? [];

  const historico = historicoBruto.map((h) => ({
    ...h,
    dataLabel: formatarDataHora(h.createdAt),
  }));

  // Data do exame: a do ortograma já existente ou hoje (novo).
  const data = atual?.createdAt ? formatarData(atual.createdAt) : formatarData(new Date().toISOString());

  const nomeChart = atual?.professionalName;
  const assinante = nomeChart && nomeChart !== "—" ? nomeChart : null;

  return (
    <SecaoClinica
      patientId={patientId}
      identificacao={resumo?.identificacao ?? null}
      title="Ortograma"
      subtitle="Marque as condições de cada dente e registre as observações do exame"
    >
      <OrtogramaClient
        patientId={patientId}
        chartId={atual?.id ?? null}
        marcasIniciais={marcasIniciais}
        notesIniciais={atual?.notes ?? ""}
        updatedAt={atual?.updatedAt}
        herdadoDeData={herdadoDe ? formatarData(herdadoDe.createdAt) : null}
        historico={historico}
        cabecalho={{
          clinica: {
            nome: settings.clinicName,
            cnpj: settings.cnpj,
            endereco: settings.address,
            telefone: settings.phone,
          },
          paciente: resumo?.identificacao?.nome ?? "—",
          nascimento: resumo?.identificacao?.nascimento ?? "—",
          prontuario: resumo?.identificacao?.registro ?? "—",
          data,
          // Num ortograma já salvo vale quem o assinou, não quem está olhando.
          // O data layer devolve "—" quando não há profissional no chart.
          profissional: assinante ?? profissional?.nome ?? "—",
          cro: profissional?.conselho ?? "—",
        }}
      />
    </SecaoClinica>
  );
}
