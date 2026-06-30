import { getSettings } from "@/lib/data/settings";
import { getAttendanceFlow } from "@/lib/data/attendance-flow";
import { listAttendanceOptions } from "@/lib/data/attendance-options";
import { listAnamneseTemplates } from "@/lib/data/anamnese-templates";
import { listTriageTemplates } from "@/lib/data/triage-templates";
import { requireView } from "@/lib/permissions";
import { isGestor } from "@/lib/auth";
import { ConfiguracoesClient } from "./ConfiguracoesClient";

export default async function ConfiguracoesPage() {
  await requireView("configuracoes");
  const [
    settings,
    stages,
    anamneseTemplates,
    triageTemplates,
    attendanceOptions,
    gestor,
  ] = await Promise.all([
    getSettings(),
    getAttendanceFlow(),
    listAnamneseTemplates(),
    listTriageTemplates(),
    listAttendanceOptions(),
    isGestor(),
  ]);
  return (
    <ConfiguracoesClient
      settings={settings}
      stages={stages}
      anamneseTemplates={anamneseTemplates}
      triageTemplates={triageTemplates}
      attendanceOptions={attendanceOptions}
      isGestor={gestor}
    />
  );
}
