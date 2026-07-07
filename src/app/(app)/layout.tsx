/* eslint-disable */
import { Sidebar } from "@/components/app/Sidebar";
import { Topbar } from "@/components/app/Topbar";
import { PageTransition } from "@/components/app/PageTransition";
import { MotionProvider } from "@/components/app/MotionProvider";
import { AutoRefresh } from "@/components/app/AutoRefresh";
import { Toaster } from "@/components/ui/Toaster";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getCurrentUser } from "@/lib/auth";
import { getMyPermissions } from "@/lib/permissions";
import { getMenuCounters, getNotificacoes } from "@/lib/data/dashboard";
import { getSettings } from "@/lib/data/settings";
import { DEMO_USER, isDemoMode } from "@/lib/supabase/config";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    // Modo demo (fora de prod, sem Supabase): usuário fictício. Caso contrário: usuário real.
    let user = DEMO_USER;
    if (!isDemoMode()) {
      const current = await getCurrentUser();
      if (current?.profile) {
        user = {
          name: current.profile.full_name ?? "Usuário",
          role: roleLabel(current.profile.role),
        };
      }
    }
    // Permissões do papel logado: definem quais itens do menu aparecem.
    // Branding: logo da clínica (white-label) exibido no topo da sidebar.
    const [permissions, counters, settings, notificacoes] = await Promise.all([
      getMyPermissions(),
      getMenuCounters(),
      getSettings(),
      getNotificacoes(),
    ]);

    // Gate por papel: o sino só mostra notificações de módulos que o usuário pode ver.
    const notificacoesVisiveis = notificacoes.filter(
      (n) => permissions[n.module]?.canView,
    );

    return (
      <MotionProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar
            user={user}
            permissions={permissions}
            counters={counters}
            logoUrl={settings.branding.logoUrl}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar
              user={user}
              permissions={permissions}
              counters={counters}
              notificacoes={notificacoesVisiveis}
            />
            <main className="flex-1 overflow-y-auto p-6">
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
        </div>
        <Toaster />
        {/* Confirmação global (substitui window.confirm por modal estilizado). */}
        <ConfirmDialog />
        {/* Atualização automática (polling) — todas as telas do app sem F5. */}
        <AutoRefresh />
      </MotionProvider>
    );
  } catch (err: any) {
    if (err.message && err.message === 'NEXT_REDIRECT') throw err; // Allow Next.js redirects to bubble
    return (
      <html lang="pt-BR">
        <body>
          <div style={{ padding: 20, background: 'red', color: 'white' }}>
            <h2>SSR CRASH IN AppLayout</h2>
            <pre>{err.message || String(err)}</pre>
            <pre>{err.stack}</pre>
          </div>
        </body>
      </html>
    );
  }
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    admin: "Administrador",
    medico: "Médico",
    recepcao: "Recepção",
    paciente: "Paciente",
  };
  return map[role] ?? role;
}
