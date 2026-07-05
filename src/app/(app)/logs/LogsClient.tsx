"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  ScrollText,
  Search,
  ChevronLeft,
  ChevronRight,
  Users,
  Activity,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, type Status } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import type {
  SystemLogRow,
  SystemLogFiltro,
} from "@/lib/data/system-logs";

// ════════════════════════════════════════════════════════════════
// Exportação CSV — gerada no client a partir dos dados já carregados.
// Separador ";" + BOM UTF-8 para abrir corretamente no Excel pt-BR.
// (mesma implementação usada em Relatórios)
// ════════════════════════════════════════════════════════════════
function downloadCSV(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const escape = (v: string | number) => {
    const s = String(v);
    return /["\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((r) => r.map(escape).join(";"));
  const BOM = "﻿"; // abre corretamente no Excel pt-BR
  const blob = new Blob([BOM + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Formata ISO → "dd/mm/aaaa hh:mm" (pt-BR). */
const fmtDataHora = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** Rótulos PT-BR dos papéis (para o Badge do usuário). */
const ROLE_LABELS: Record<string, string> = {
  admin: "Gestor",
  medico: "Médico",
  recepcao: "Recepção",
  enfermagem: "Enfermagem",
  paciente: "Paciente",
};

/** Tom do Badge por papel. */
const roleTone = (role: string): Status =>
  role === "admin"
    ? "active"
    : role === "medico"
      ? "wait"
      : role === "enfermagem"
        ? "warn"
        : "ok";

/**
 * Tom semântico da AÇÃO (verde=criação, azul=edição, vermelho=exclusão,
 * teal=login/logout, laranja=demais). Mapeamento por palavra-chave para
 * cobrir variações vindas do backend (create/created/criar…).
 */
function actionTone(action: string): Status {
  const a = action.toLowerCase();
  if (/(login|logout|sign|auth)/.test(a)) return "active";
  if (/(create|insert|add|cria|novo|nova)/.test(a)) return "ok";
  if (/(update|edit|alter|atualiz|edita)/.test(a)) return "wait";
  if (/(delete|remove|destroy|exclui|remove)/.test(a)) return "danger";
  return "warn";
}

export function LogsClient({
  rows,
  total,
  options,
  filtros,
  page,
  limit,
}: {
  rows: SystemLogRow[];
  total: number;
  options: {
    modules: string[];
    actions: string[];
    actors: { id: string; name: string }[];
    clinics: { id: string; name: string }[];
  };
  filtros: SystemLogFiltro;
  page: number;
  limit: number;
}) {
  const router = useRouter();
  const [aplicando, startAplicar] = useTransition();

  // Estado local dos filtros (reflete a URL vigente).
  const [q, setQ] = useState(filtros.q ?? "");
  const [module, setModule] = useState(filtros.module ?? "");
  const [action, setAction] = useState(filtros.action ?? "");
  const [actorId, setActorId] = useState(filtros.actorId ?? "");
  const [clinicId, setClinicId] = useState(filtros.clinicId ?? "");
  const [from, setFrom] = useState(filtros.from ?? "");
  const [to, setTo] = useState(filtros.to ?? "");

  /** Monta a query e navega (a page re-consulta no servidor). Reseta page. */
  function push(extra?: Record<string, string>) {
    const params = new URLSearchParams();
    const set = (k: string, v: string) => v && params.set(k, v);
    set("q", q);
    set("module", module);
    set("action", action);
    set("actorId", actorId);
    set("clinicId", clinicId);
    set("from", from);
    set("to", to);
    if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v);
    const qs = params.toString();
    startAplicar(() => router.push(qs ? `/logs?${qs}` : "/logs"));
  }

  function aplicarFiltros() {
    push(); // sem page → volta para a 1ª página
  }

  function limparFiltros() {
    setQ("");
    setModule("");
    setAction("");
    setActorId("");
    setClinicId("");
    setFrom("");
    setTo("");
    startAplicar(() => router.push("/logs"));
  }

  const temFiltro =
    !!q || !!module || !!action || !!actorId || !!clinicId || !!from || !!to;

  // Paginação
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const inicio = total === 0 ? 0 : (page - 1) * limit + 1;
  const fim = Math.min(page * limit, total);

  function irParaPagina(p: number) {
    push({ page: String(p) });
  }

  // StatCards do filtro atual (contagem + usuários distintos na página).
  const usuariosDistintos = new Set(rows.map((r) => r.actorName)).size;

  /** Exporta os logs carregados (página atual) em CSV. */
  function exportar() {
    downloadCSV(
      "log-do-sistema.csv",
      [
        "Data/Hora",
        "Usuário",
        "Papel",
        "Clínica",
        "Módulo",
        "Ação",
        "Descrição",
        "Entidade",
        "ID Entidade",
      ],
      rows.map((r) => [
        fmtDataHora(r.createdAt),
        r.actorName,
        ROLE_LABELS[r.actorRole] ?? r.actorRole,
        r.clinicName ?? "—",
        r.module,
        r.action,
        r.summary,
        r.entity ?? "",
        r.entityId ?? "",
      ]),
    );
  }

  return (
    <>
      <PageHeader
        title="Log do Sistema"
        subtitle="Trilha de auditoria global — quem fez o quê, em todas as clínicas"
        actions={
          <Button
            variant="primary"
            onClick={exportar}
            disabled={rows.length === 0}
          >
            <Download className="h-4 w-4" /> Exportar página (CSV)
          </Button>
        }
      />

      {/* KPIs do recorte atual */}
      <Stagger className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <FadeInUp>
          <StatCard
            icon={<ScrollText className="h-5 w-5" />}
            value={total.toLocaleString("pt-BR")}
            label="Eventos no filtro"
            tone="neutral"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Users className="h-5 w-5" />}
            value={usuariosDistintos}
            label="Usuários na página"
            tone="info"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Activity className="h-5 w-5" />}
            value={options.clinics.length}
            label="Clínicas monitoradas"
            tone="success"
          />
        </FadeInUp>
      </Stagger>

      {/* Filtros — aplicados no servidor (via URL → re-consulta a page) */}
      <Card className="p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            aplicarFiltros();
          }}
        >
          <label className="block flex-1 min-w-[220px]">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Buscar
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Usuário ou descrição…"
                className="pl-9"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Módulo
            </span>
            <Select
              className="w-44"
              value={module}
              onChange={(e) => setModule(e.target.value)}
            >
              <option value="">Todos os módulos</option>
              {options.modules.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Ação
            </span>
            <Select
              className="w-44"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="">Todas as ações</option>
              {options.actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Usuário
            </span>
            <Select
              className="w-48"
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
            >
              <option value="">Todos os usuários</option>
              {options.actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Clínica
            </span>
            <Select
              className="w-48"
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
            >
              <option value="">Todas as clínicas</option>
              {options.clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              De
            </span>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              max={to || undefined}
              className="w-44"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Até
            </span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              min={from || undefined}
              className="w-44"
            />
          </label>

          <Button type="submit" variant="outline" disabled={aplicando}>
            {aplicando ? "Aplicando…" : "Aplicar"}
          </Button>
          {temFiltro && (
            <Button
              type="button"
              variant="ghost"
              onClick={limparFiltros}
              disabled={aplicando}
            >
              Limpar
            </Button>
          )}
        </form>
      </Card>

      {/* Tabela de eventos */}
      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-5">
          <h3 className="font-semibold text-ink">
            Eventos{" "}
            <span className="text-muted">
              ({total.toLocaleString("pt-BR")})
            </span>
          </h3>
          {total > 0 && (
            <span className="text-sm text-muted">
              {inicio}–{fim} de {total.toLocaleString("pt-BR")}
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="border-t border-line">
            <EmptyState
              icon={ScrollText}
              title="Nenhum evento encontrado"
              description={
                temFiltro
                  ? "Ajuste os filtros para ampliar a busca na trilha de auditoria."
                  : "Os eventos aparecem conforme os usuários operam o sistema."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted-surface text-xs font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3">Data/Hora</th>
                  <th className="px-5 py-3">Usuário</th>
                  <th className="px-5 py-3">Clínica</th>
                  <th className="px-5 py-3">Módulo</th>
                  <th className="px-5 py-3">Ação</th>
                  <th className="px-5 py-3">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-black/[0.02]">
                    <td className="whitespace-nowrap px-5 py-3 text-muted">
                      {fmtDataHora(r.createdAt)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">
                          {r.actorName}
                        </span>
                        <Badge status={roleTone(r.actorRole)}>
                          {ROLE_LABELS[r.actorRole] ?? r.actorRole}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {r.clinicName ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-muted">{r.module}</td>
                    <td className="px-5 py-3">
                      <Badge status={actionTone(r.action)}>{r.action}</Badge>
                    </td>
                    <td className="px-5 py-3 text-ink">
                      <span
                        title={
                          r.entity
                            ? `${r.entity}${r.entityId ? ` · ${r.entityId}` : ""}`
                            : undefined
                        }
                      >
                        {r.summary}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação server-side */}
        {total > limit && (
          <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-4">
            <span className="text-sm text-muted">
              Página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || aplicando}
                onClick={() => irParaPagina(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || aplicando}
                onClick={() => irParaPagina(page + 1)}
              >
                Próxima <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
