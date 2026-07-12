import { notFound } from "next/navigation";
import { getQueueItem } from "@/lib/data/queue";
import { listAttendanceOptions } from "@/lib/data/attendance-options";
import { listProfissionaisVinculo } from "@/lib/data/professionals";
import { listActiveConsentTemplates } from "@/lib/data/consent-templates";
import { getSettings } from "@/lib/data/settings";
import { requireView } from "@/lib/permissions";
import { AtendimentoClient } from "./AtendimentoClient";

export default async function AtendimentoDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reimprimir?: string }>;
}) {
  await requireView("fila");

  const { id } = await params;
  const { reimprimir } = await searchParams;
  const autoReimprimir = reimprimir === "1";
  const item = await getQueueItem(id);

  if (!item) {
    notFound();
  }

  const [attendanceOptions, profissionais, termosAtivos, settings] =
    await Promise.all([
      listAttendanceOptions(),
      listProfissionaisVinculo(),
      listActiveConsentTemplates(),
      getSettings(),
    ]);

  const clinica = {
    nome: settings.clinicName,
    cnpj: settings.cnpj,
    endereco: settings.address,
    telefone: settings.phone,
  };

  return (
    <AtendimentoClient
      item={item}
      attendanceOptions={attendanceOptions}
      profissionais={profissionais}
      termosAtivos={termosAtivos}
      clinica={clinica}
      autoReimprimir={autoReimprimir}
    />
  );
}
