"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { cn, initials } from "@/lib/utils";
import { NAV_GROUPS } from "./nav";
import { Logo } from "./Logo";
import { signOut } from "@/lib/actions/auth";
import { useUIStore } from "@/lib/store/ui";
import type { PermissionMap } from "@/lib/permissions.shared";

/** Transição suave compartilhada entre a largura da sidebar e o slide do conteúdo. */
const SIDEBAR_SPRING = { type: "spring", stiffness: 400, damping: 40, mass: 0.9 } as const;

export function Sidebar({
  user,
  permissions,
  counters,
  logoUrl,
}: {
  user: { name: string; role: string };
  /** Permissões do papel logado: filtra os itens visíveis no menu. */
  permissions: PermissionMap;
  /** Contadores reais para os badges (fila aguardando + aguardando pagamento, estoque crítico). */
  counters?: {
    filaAguardando: number;
    aguardandoPagamento: number;
    estoqueCriticos: number;
  };
  /** Logo da clínica (white-label). Quando ausente, usa o wordmark AGIcare. */
  logoUrl?: string | null;
}) {
  const pathname = usePathname();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);

  /** Badge real por módulo (sobrepõe o badge estático do nav). */
  const badgeFor = (module: string, fallback?: number): number | undefined => {
    // Fila = pacientes aguardando atendimento + prontos para pagamento (ambos
    // são ações da recepção na Fila): o badge sinaliza quem precisa de atenção lá.
    if (module === "fila") {
      if (!counters) return fallback;
      return counters.filaAguardando + counters.aguardandoPagamento;
    }
    if (module === "estoque") return counters?.estoqueCriticos ?? fallback;
    return fallback;
  };

  return (
    <motion.aside
      className="h-full shrink-0 overflow-hidden bg-[#0a3838]"
      initial={false}
      animate={{ width: collapsed ? 0 : 240 }}
      transition={SIDEBAR_SPRING}
      aria-hidden={collapsed}
    >
      <motion.div
        className="flex h-full w-60 flex-col"
        initial={false}
        animate={{ x: collapsed ? -240 : 0 }}
        transition={SIDEBAR_SPRING}
        inert={collapsed || undefined}
      >
        <div className="px-6 py-5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Logo da clínica"
            className="h-9 w-auto max-w-[168px] object-contain"
          />
        ) : (
          <Logo onDark className="text-2xl" />
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter(
            // Dashboard sempre visível; demais itens dependem da permissão do papel.
            (i) => i.module === "dashboard" || permissions[i.module]?.canView,
          );
          if (items.length === 0) return null;
          return (
            <div key={group.title} className="space-y-1">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                {group.title}
              </p>
              {items.map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                // Entradas duplicadas em outro grupo (hideCounter) não repetem o badge.
                const badge = item.hideCounter
                  ? undefined
                  : badgeFor(item.module, item.badge);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-white text-brand-600 shadow-sm"
                        : "text-white/80 hover:bg-[#0f4c4c]",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge != null && badge > 0 && (
                      <span
                        className={cn(
                          "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                          active ? "bg-brand-500 text-white" : "bg-accent text-secondary",
                        )}
                      >
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="m-3 flex items-center gap-3 rounded-xl bg-white/10 p-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-xs font-semibold text-brand-600">
          {initials(user.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-white">{user.name}</div>
          <div className="truncate text-xs text-white/70">{user.role}</div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            aria-label="Sair"
            className="text-white/70 hover:text-white"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
        </div>
      </motion.div>
    </motion.aside>
  );
}
