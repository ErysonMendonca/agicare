"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  Search,
  PanelLeftClose,
  Menu,
  Package,
  Users,
  ReceiptText,
  BellOff,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { initials } from "@/lib/utils";
import { NAV_GROUPS } from "./nav";
import { useUIStore } from "@/lib/store/ui";
import type { PermissionMap } from "@/lib/permissions.shared";
import type { Notificacao, NotifTipo } from "@/lib/data/dashboard";

/** Ícone por tipo de notificação. */
const NOTIF_ICON: Record<NotifTipo, typeof Bell> = {
  fila: Users,
  estoque: Package,
  fatura: ReceiptText,
};

/** Estilo do ícone por severidade. */
const SEVERITY_STYLE: Record<Notificacao["severity"], string> = {
  danger: "bg-red-50 text-red-600",
  warn: "bg-amber-50 text-amber-600",
  info: "bg-brand-50 text-brand-600",
};

export function Topbar({
  user,
  permissions,
  counters,
  notificacoes = [],
}: {
  user: { name: string; role: string };
  /** Permissões do papel logado: a busca só sugere módulos visíveis ao usuário. */
  permissions: PermissionMap;
  /** Contadores reais (fila aguardando + estoque crítico) → contagem de notificações. */
  counters?: {
    filaAguardando: number;
    aguardandoPagamento: number;
    estoqueCriticos: number;
  };
  /** Notificações reais já filtradas por permissão (estoque/fila/faturas). */
  notificacoes?: Notificacao[];
}) {
  const router = useRouter();
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const inputRef = useRef<HTMLInputElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Painel do sino (dropdown) — pendências operacionais reais (fila/estoque/fatura).
  const [notifOpen, setNotifOpen] = useState(false);

  // Itens navegáveis pela busca = mesmos do menu, filtrados pela permissão do papel
  // (Dashboard sempre disponível; demais dependem de canView) — mesma regra do Sidebar.
  const navItems = useMemo(
    () =>
      NAV_GROUPS.flatMap((g) => g.items).filter(
        (i) => i.module === "dashboard" || permissions[i.module]?.canView,
      ),
    [permissions],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return navItems
      .filter((i) => i.label.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, navItems]);

  // ⌘K / Ctrl+K → foca a busca de qualquer lugar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Fecha o painel do sino ao clicar fora ou pressionar Esc.
  useEffect(() => {
    if (!notifOpen) return;
    const onDown = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNotifOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [notifOpen]);

  const go = (href: string) => {
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
    router.push(href);
  };

  // Notificações = pendências operacionais reais (fila aguardando + estoque crítico).
  // Ponto de integração: trocar por uma fonte de notificações dedicada quando existir.
  const notifCount =
    (counters?.filaAguardando ?? 0) +
    (counters?.aguardandoPagamento ?? 0) +
    (counters?.estoqueCriticos ?? 0);

  const showResults = open && query.trim().length > 0;

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line bg-surface px-5">
      <button
        type="button"
        onClick={toggleSidebar}
        className="rounded-lg p-1 text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
        aria-expanded={!sidebarCollapsed}
      >
        {sidebarCollapsed ? (
          <Menu className="h-5 w-5" />
        ) : (
          <PanelLeftClose className="h-5 w-5" />
        )}
      </button>

      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Atraso para permitir o clique num resultado antes de fechar.
            window.setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQuery("");
              setOpen(false);
              inputRef.current?.blur();
              return;
            }
            if (!results.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i - 1 + results.length) % results.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              const target = results[active] ?? results[0];
              if (target) go(target.href);
            }
          }}
          role="combobox"
          aria-expanded={showResults}
          aria-controls="topbar-search-results"
          aria-autocomplete="list"
          placeholder="Buscar módulo..."
          className="h-9 w-full rounded-lg border border-line bg-canvas pl-9 pr-12 text-sm placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line bg-white px-1.5 py-0.5 text-[10px] text-muted">
          ⌘K
        </kbd>

        {showResults && (
          <ul
            id="topbar-search-results"
            role="listbox"
            className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg"
          >
            {results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted">
                Nenhum resultado para “{query.trim()}”.
              </li>
            ) : (
              results.map((r, i) => {
                const Icon = r.icon;
                return (
                  <li key={r.href} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      // Evita o blur do input fechar o menu antes do clique.
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(r.href)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                        i === active
                          ? "bg-brand-50 text-brand-700"
                          : "text-ink hover:bg-black/5"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted" />
                      <span className="truncate">{r.label}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>

      <div className="ml-auto flex items-center gap-4">
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            className="relative rounded-lg p-1 text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            aria-haspopup="dialog"
            aria-expanded={notifOpen}
            aria-label={
              notifCount > 0
                ? `Notificações, ${notifCount} pendência(s)`
                : "Notificações"
            }
          >
            <Bell className="h-5 w-5" />
            {notifCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[--color-status-danger] px-1 text-[10px] font-semibold leading-none text-white">
                {notifCount > 9 ? "9+" : notifCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div
              role="dialog"
              aria-label="Notificações"
              className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-white shadow-lg"
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <span className="text-sm font-semibold text-ink">
                  Notificações
                </span>
                {notifCount > 0 && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600">
                    {notifCount} pendência(s)
                  </span>
                )}
              </div>

              {notificacoes.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted-surface text-muted">
                    <BellOff className="h-5 w-5" />
                  </span>
                  <p className="text-sm font-medium text-ink">
                    Tudo em dia
                  </p>
                  <p className="text-xs text-muted">
                    Nenhuma pendência no momento.
                  </p>
                </div>
              ) : (
                <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                  {notificacoes.map((n) => {
                    const Icon = NOTIF_ICON[n.tipo];
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            router.push(n.href);
                          }}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-black/5"
                        >
                          <span
                            className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${SEVERITY_STYLE[n.severity]}`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink">
                              {n.titulo}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {n.descricao}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <Link
                href="/notificacoes"
                onClick={() => setNotifOpen(false)}
                className="block border-t border-line px-4 py-2.5 text-center text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
              >
                Ver histórico de notificações
              </Link>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <div className="text-right">
            <div className="text-sm font-medium text-ink">{user.name}</div>
            <div className="text-xs text-muted">{user.role}</div>
          </div>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
            {initials(user.name)}
          </span>
        </div>
      </div>
    </header>
  );
}
