import { getSettings } from "@/lib/data/settings";
import { requireView } from "@/lib/permissions";
import { ConfiguracoesClient } from "./ConfiguracoesClient";

export default async function ConfiguracoesPage() {
  await requireView("configuracoes");
  const settings = await getSettings();
  return <ConfiguracoesClient settings={settings} />;
}
