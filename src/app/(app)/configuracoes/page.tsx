import { getSettings } from "@/lib/data/settings";
import { listAttendanceOptions } from "@/lib/data/attendance-options";
import { isGestor } from "@/lib/auth";
import { requireView } from "@/lib/permissions";
import { listAnamneseTemplates } from "@/lib/data/anamnese-templates";
import { ConfiguracoesClient } from "./ConfiguracoesClient";

export default async function ConfiguracoesPage() {
  await requireView("configuracoes");
  const [settings, anamneseTemplates, attendanceOptions, gestor] =
    await Promise.all([
      getSettings(),
      listAnamneseTemplates(),
      listAttendanceOptions(),
      isGestor(),
    ]);
  return (
    <ConfiguracoesClient
      settings={settings}
      anamneseTemplates={anamneseTemplates}
      attendanceOptions={attendanceOptions}
      gestor={gestor}
    />
  );
}
