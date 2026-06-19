import { getSettings } from "@/lib/data/settings";
import { requireView } from "@/lib/permissions";
import { listAnamneseTemplates } from "@/lib/data/anamnese-templates";
import { ConfiguracoesClient } from "./ConfiguracoesClient";

export default async function ConfiguracoesPage() {
  await requireView("configuracoes");
  const [settings, anamneseTemplates] = await Promise.all([
    getSettings(),
    listAnamneseTemplates(),
  ]);
  return (
    <ConfiguracoesClient
      settings={settings}
      anamneseTemplates={anamneseTemplates}
    />
  );
}
