import { getSettings } from "@/lib/data/settings";
import { getAttendanceFlow } from "@/lib/data/attendance-flow";
import { requireView } from "@/lib/permissions";
import { isGestor } from "@/lib/auth";
import { ConfiguracoesClient } from "./ConfiguracoesClient";

export default async function ConfiguracoesPage() {
  await requireView("configuracoes");
  const [settings, stages, gestor] = await Promise.all([
    getSettings(),
    getAttendanceFlow(),
    isGestor(),
  ]);
  return (
    <ConfiguracoesClient settings={settings} stages={stages} isGestor={gestor} />
  );
}
