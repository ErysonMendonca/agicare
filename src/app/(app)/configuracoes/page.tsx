import { getSettings } from "@/lib/data/settings";
import { getAttendanceFlow } from "@/lib/data/attendance-flow";
import { listAttendanceOptions } from "@/lib/data/attendance-options";
import { listEspecialidades } from "@/lib/data/especialidades";
import { listAnamneseTemplates } from "@/lib/data/anamnese-templates";
import { listTriageTemplates } from "@/lib/data/triage-templates";
import { listCidCodes } from "@/lib/data/cid";
import { listAltaCatalogosConfig } from "@/lib/data/alta";
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
    especialidades,
    cidCodes,
    altaCatalogos,
    gestor,
  ] = await Promise.all([
    getSettings(),
    getAttendanceFlow(),
    listAnamneseTemplates(),
    listTriageTemplates(),
    listAttendanceOptions(),
    listEspecialidades(),
    listCidCodes(),
    listAltaCatalogosConfig(),
    isGestor(),
  ]);
  return (
    <ConfiguracoesClient
      settings={settings}
      stages={stages}
      anamneseTemplates={anamneseTemplates}
      triageTemplates={triageTemplates}
      attendanceOptions={attendanceOptions}
      especialidades={especialidades}
      cidCodes={cidCodes}
      motivosAlta={altaCatalogos.motivos}
      detalhesAlta={altaCatalogos.detalhes}
      isGestor={gestor}
    />
  );
}
