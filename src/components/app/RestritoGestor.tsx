import { Lock } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/Card";

/** Estado de "acesso restrito ao gestor" para módulos/dados financeiros (LGPD). */
export function RestritoGestor({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <Card className="mt-6 flex flex-col items-center justify-center gap-3 p-12 text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-muted-surface text-muted">
          <Lock className="h-7 w-7" />
        </span>
        <h3 className="text-lg font-semibold text-ink">Acesso restrito ao gestor</h3>
        <p className="max-w-md text-sm text-muted">
          Este módulo contém informações financeiras e estratégicas, visíveis
          apenas para usuários com perfil de gestor.
        </p>
      </Card>
    </>
  );
}
