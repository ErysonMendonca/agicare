"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  Mail,
  Phone,
  CalendarDays,
  CalendarClock,
  FileText,
  ShieldCheck,
  Users,
  Stethoscope,
  Briefcase,
  CircleCheck,
  Plus,
  SquarePen,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { StatCard } from "@/components/ui/StatCard";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import type { Profissional } from "@/lib/data/professionals";
import type { AttendanceOption } from "@/lib/data/attendance-options.shared";

type AbaId = "clinica" | "administrativa" | "perfis";

const ABAS: { id: AbaId; label: string }[] = [
  { id: "clinica", label: "Equipe Clínica" },
  { id: "administrativa", label: "Equipe Administrativa" },
  { id: "perfis", label: "Perfis de Acesso" },
];

/**
 * Papéis assistenciais (equipe clínica). Client-safe — espelha PAPEIS_CLINICOS
 * de @/lib/data/professionals sem importar daquele módulo (que puxa server).
 */
const PAPEIS_CLINICOS = ["medico", "enfermeiro", "enfermagem"];

/** Classe de Link estilizado como Button outline (evita <button> dentro de <a>). */
const LINK_BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-brand-500 bg-white font-medium text-brand-600 transition-all duration-150 hover:-translate-y-px hover:bg-brand-50";
const LINK_BTN_SM = `${LINK_BTN_BASE} h-8 px-3 text-xs`;
const LINK_BTN_MD = `${LINK_BTN_BASE} h-10 gap-2 px-4 text-sm`;

/**
 * Lista de profissionais com abas FUNCIONAIS (Clínica/Administrativa/Perfis) e
 * busca por nome/especialidade/conselho. O fetch é feito no Server Component
 * (page.tsx); aqui apenas filtramos a exibição (estado local).
 *
 * - "Perfis de Acesso": resumo por papel + atalho para /permissoes.
 * - "Ver Agenda": rota real /profissionais/{id}/agenda (lista os agendamentos
 *   do profissional, reusando o data layer de appointments).
 * - "Documentos": rota real /profissionais/{id}/documentos (empty-state honesto
 *   enquanto não há armazenamento de arquivos).
 */
export function ProfissionaisLista({
  profissionais,
  kpis,
  especialidades,
}: {
  profissionais: Profissional[];
  kpis: {
    total: number;
    clinica: number;
    administrativa: number;
    ativos: number;
  };
  especialidades: AttendanceOption[];
}) {
  const [aba, setAba] = useState<AbaId>("clinica");
  const [busca, setBusca] = useState("");
  // Filtros (painel acionado pelo botão "Filtrar").
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativo" | "inativo">(
    "todos",
  );
  const [filtroEspec, setFiltroEspec] = useState("todas");

  // Opções do filtro: catálogo (attendance_options) unido às especialidades já
  // presentes nos profissionais (legado), para nada ficar sem filtro.
  const especialidadesFiltro = useMemo(() => {
    const set = new Set<string>();
    for (const e of especialidades) if (e.value) set.add(e.value);
    for (const p of profissionais) {
      if (p.especialidade && p.especialidade !== "—") set.add(p.especialidade);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [especialidades, profissionais]);

  const filtrosAtivos =
    (filtroStatus !== "todos" ? 1 : 0) + (filtroEspec !== "todas" ? 1 : 0);

  const porAba = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return profissionais.filter((p) => {
      const ehClinico = PAPEIS_CLINICOS.includes(p.role);
      const casaAba =
        aba === "perfis" ||
        (aba === "clinica" ? ehClinico : !ehClinico);
      const casaBusca =
        !q ||
        p.nome.toLowerCase().includes(q) ||
        p.especialidade.toLowerCase().includes(q) ||
        p.crm.toLowerCase().includes(q);
      // Os filtros de status/especialidade não se aplicam à aba "Perfis"
      // (painel oculto lá) — evita filtrar de forma invisível ao usuário.
      const aplicaFiltros = aba !== "perfis";
      const casaStatus =
        !aplicaFiltros ||
        filtroStatus === "todos" ||
        (filtroStatus === "ativo" ? p.ativo : !p.ativo);
      const casaEspec =
        !aplicaFiltros ||
        filtroEspec === "todas" ||
        p.especialidade === filtroEspec;
      return casaAba && casaBusca && casaStatus && casaEspec;
    });
  }, [profissionais, aba, busca, filtroStatus, filtroEspec]);

  /** KPI "Ativos": filtra por status ativo (toggle), revela o painel e sai de "Perfis". */
  function toggleAtivos() {
    setFiltroStatus((prev) => {
      const next = prev === "ativo" ? "todos" : "ativo";
      if (next === "ativo") {
        setMostrarFiltros(true);
        setAba((a) => (a === "perfis" ? "clinica" : a));
      }
      return next;
    });
  }

  return (
    <>
      {/* KPIs clicáveis: Clínica/Administrativa trocam a aba; Ativos filtra por
          status; Total limpa os filtros. */}
      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FadeInUp>
          <StatCard
            icon={<Users className="h-5 w-5" />}
            value={String(kpis.total)}
            label="Total de Profissionais"
            tone="neutral"
            onClick={() => {
              setFiltroStatus("todos");
              setFiltroEspec("todas");
            }}
            active={filtroStatus === "todos" && filtroEspec === "todas"}
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Stethoscope className="h-5 w-5" />}
            value={String(kpis.clinica)}
            label="Equipe Clínica"
            tone="neutral"
            onClick={() => setAba("clinica")}
            active={aba === "clinica"}
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Briefcase className="h-5 w-5" />}
            value={String(kpis.administrativa)}
            label="Equipe Administrativa"
            tone="neutral"
            onClick={() => setAba("administrativa")}
            active={aba === "administrativa"}
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<CircleCheck className="h-5 w-5" />}
            value={String(kpis.ativos)}
            label="Profissionais Ativos"
            tone="success"
            onClick={toggleAtivos}
            active={filtroStatus === "ativo"}
          />
        </FadeInUp>
      </Stagger>

      {/* Abas funcionais */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={
              aba === a.id
                ? "rounded-full bg-brand-500 px-4 py-1.5 text-sm font-medium text-white"
                : "rounded-full px-4 py-1.5 text-sm font-medium text-muted hover:bg-black/5"
            }
          >
            {a.label}
          </button>
        ))}
      </div>

      <Stagger className="mt-4">
        <FadeInUp>
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-ink">
                  {aba === "clinica"
                    ? "Profissionais de Saúde"
                    : aba === "administrativa"
                      ? "Equipe Administrativa"
                      : "Perfis de Acesso"}
                </h3>
                <p className="text-sm text-muted">
                  {aba === "clinica"
                    ? "Médicos, enfermeiros e equipe assistencial"
                    : aba === "administrativa"
                      ? "Recepção, administração e apoio"
                      : "Papel de cada profissional e controle de permissões"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input
                    placeholder="Buscar profissional..."
                    className="w-64 pl-9"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
                {aba === "perfis" ? (
                  <Link href="/permissoes" className={LINK_BTN_MD}>
                    <ShieldCheck className="h-4 w-4" /> Gerenciar Perfis
                  </Link>
                ) : (
                  <>
                    <Button
                      variant={mostrarFiltros ? "primary" : "outline"}
                      size="md"
                      onClick={() => setMostrarFiltros((v) => !v)}
                      aria-expanded={mostrarFiltros}
                    >
                      <Filter className="h-4 w-4" /> Filtrar
                      {filtrosAtivos > 0 && (
                        <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/90 px-1.5 text-xs font-semibold text-brand-600">
                          {filtrosAtivos}
                        </span>
                      )}
                    </Button>
                    <Link
                      href={aba === "administrativa" ? "/profissionais/novo-admin" : "/profissionais/novo"}
                      className={LINK_BTN_MD}
                    >
                      <Plus className="h-4 w-4" />
                      {aba === "administrativa" ? "Novo Administrativo" : "Novo Profissional"}
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* Painel de filtros (status / especialidade) */}
            {aba !== "perfis" && mostrarFiltros && (
              <div className="flex flex-col gap-4 border-t border-line bg-canvas/40 px-5 py-4 sm:flex-row sm:items-end">
                <Select
                  id="filtro-status"
                  label="Status"
                  className="sm:w-48"
                  value={filtroStatus}
                  onChange={(e) =>
                    setFiltroStatus(
                      e.target.value as "todos" | "ativo" | "inativo",
                    )
                  }
                >
                  <option value="todos">Todos</option>
                  <option value="ativo">Ativos</option>
                  <option value="inativo">Inativos</option>
                </Select>
                <Select
                  id="filtro-especialidade"
                  label="Especialidade"
                  className="sm:w-64"
                  value={filtroEspec}
                  onChange={(e) => setFiltroEspec(e.target.value)}
                >
                  <option value="todas">Todas</option>
                  {especialidadesFiltro.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </Select>
                {filtrosAtivos > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFiltroStatus("todos");
                      setFiltroEspec("todas");
                    }}
                  >
                    Limpar filtros
                  </Button>
                )}
              </div>
            )}

            <div className="border-t border-line">
              {porAba.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted">
                  Nenhum profissional nesta categoria.
                </div>
              ) : (
                porAba.map((p) => (
                  <div
                    key={p.id}
                    className="border-b border-line px-5 py-4 last:border-0"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <Avatar
                          name={p.nome}
                          className="h-11 w-11 bg-brand-50 text-brand-600"
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-ink">
                              {p.nome}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge status="active">{p.especialidade}</Badge>
                            <span className="text-xs text-muted">{p.crm}</span>
                            <Badge status="warn">{p.cargo}</Badge>
                          </div>
                        </div>
                      </div>
                      <Badge status={p.ativo ? "ok" : "danger"}>
                        {p.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 pl-14 text-sm text-muted">
                      {p.email ? (
                        <span className="flex items-center gap-1.5">
                          <Mail className="h-4 w-4" /> {p.email}
                        </span>
                      ) : null}
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-4 w-4" /> {p.telefone}
                      </span>
                    </div>

                    {aba !== "perfis" && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 pl-14 text-sm">
                        <span className="flex items-center gap-1.5 text-muted">
                          <CalendarDays className="h-4 w-4 text-brand-600" />
                          <span className="font-medium text-ink">
                            {p.consultasHoje}
                          </span>{" "}
                          {p.consultasHoje === 1
                            ? "consulta hoje"
                            : "consultas hoje"}
                        </span>
                        <span className="flex items-center gap-1.5 text-muted">
                          <CalendarClock className="h-4 w-4 text-brand-600" />
                          Próxima:{" "}
                          <span className="font-medium text-ink">
                            {p.proximaConsulta ?? "Sem agendamentos"}
                          </span>
                        </span>
                      </div>
                    )}

                    {aba === "perfis" ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 pl-14">
                        <Badge status="active">Papel: {p.cargo}</Badge>
                        <Link href="/permissoes" className={LINK_BTN_SM}>
                          <ShieldCheck className="h-3.5 w-3.5" /> Gerenciar
                          acesso
                        </Link>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap items-center gap-2 pl-14">
                        <Link href={`/profissionais/${p.id}`} className={LINK_BTN_SM}>
                          <SquarePen className="h-3.5 w-3.5" /> Editar
                        </Link>
                        <Link
                          href={`/profissionais/${p.id}/agenda`}
                          className={LINK_BTN_SM}
                        >
                          <CalendarDays className="h-3.5 w-3.5" /> Ver Agenda
                        </Link>
                        <Link
                          href={`/profissionais/${p.id}/documentos`}
                          className={LINK_BTN_SM}
                        >
                          <FileText className="h-3.5 w-3.5" /> Documentos
                        </Link>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        </FadeInUp>
      </Stagger>
    </>
  );
}
