import { notFound } from "next/navigation";
import { getQueueItem } from "@/lib/data/queue";
import { listAttendanceOptions } from "@/lib/data/attendance-options";
import { listProfissionaisVinculo } from "@/lib/data/professionals";
import { requireView } from "@/lib/permissions";
import { AtendimentoClient } from "./AtendimentoClient";

export default async function AtendimentoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireView("fila");

  const { id } = await params;
  const item = await getQueueItem(id);

  if (!item) {
    notFound();
  }

  const [attendanceOptions, profissionais] = await Promise.all([
    listAttendanceOptions(),
    listProfissionaisVinculo(),
  ]);

  return (
    <AtendimentoClient
      item={item}
      attendanceOptions={attendanceOptions}
      profissionais={profissionais}
    />
  );
}
