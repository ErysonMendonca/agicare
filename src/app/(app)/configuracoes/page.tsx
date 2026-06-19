import { getSettings } from "@/lib/data/settings";
import { listAttendanceOptions } from "@/lib/data/attendance-options";
import { isGestor } from "@/lib/auth";
import { requireView } from "@/lib/permissions";
import { ConfiguracoesClient } from "./ConfiguracoesClient";

export default async function ConfiguracoesPage() {
  await requireView("configuracoes");
  const [settings, gestor, attendanceOptions] = await Promise.all([
    getSettings(),
    isGestor(),
    listAttendanceOptions(),
  ]);
  return (
    <ConfiguracoesClient
      settings={settings}
      gestor={gestor}
      attendanceOptions={attendanceOptions}
    />
  );
}
