import {
  ClipboardList,
  CheckCircle2,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { listProfessionals } from "@/lib/data/professionals";
import { listStockProducts } from "@/lib/data/stock";
import { listInstrumentais } from "@/lib/data/instrumental";
import { loadProcedureRelations } from "@/lib/data/procedure-relations";
import { createClient } from "@/lib/supabase/server";
import { isGestor } from "@/lib/auth";
import { RestritoGestor } from "@/components/app/RestritoGestor";
import {
  NovoProcedimentoModal,
  type ProcedureRow,
} from "./NovoProcedimentoModal";
import { ProcedimentosTabela } from "./ProcedimentosTabela";

/** Formata número para moeda brasileira (R$ pt-BR), sem centavos (KPIs). */
const moedaBR = (v: number) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

/** Colunas brutas necessárias para exibir + editar cada procedimento. */
const PROC_COLS =
  "id, code, name, description, category, commercial_desc, duration_min, setup_min, cleanup_min, sessions, session_validity_days, min_age, audience, price, cost, commission_pct, tax_pct, margin_pct, active";

/** Mock do modo demo (espelha o Figma), no shape bruto p/ edição. */
const DEMO_PROCEDURES: ProcedureRow[] = [
  {
    id: "demo-1",
    code: "PROC001",
    name: "Limpeza de Pele Profunda",
    description: "Limpeza facial completa com peeling de diamante...",
    category: "Facial",
    commercial_desc: null,
    duration_min: 85,
    setup_min: 0,
    cleanup_min: 0,
    sessions: 1,
    session_validity_days: null,
    min_age: null,
    audience: "todos",
    price: 250,
    cost: 0,
    commission_pct: 0,
    tax_pct: 0,
    margin_pct: 32,
    active: true,
  },
  {
    id: "demo-2",
    code: "PROC002",
    name: "Aplicação de Toxina Botulínica",
    description: "Aplicação de toxina para suavização de...",
    category: "Injetáveis",
    commercial_desc: null,
    duration_min: 55,
    setup_min: 0,
    cleanup_min: 0,
    sessions: 1,
    session_validity_days: null,
    min_age: null,
    audience: "todos",
    price: 1200,
    cost: 0,
    commission_pct: 0,
    tax_pct: 0,
    margin_pct: 28,
    active: true,
  },
  {
    id: "demo-3",
    code: "PROC003",
    name: "Drenagem Linfática",
    description: "Sessão completa de drenagem linfática manual co...",
    category: "Corporal",
    commercial_desc: null,
    duration_min: 60,
    setup_min: 0,
    cleanup_min: 0,
    sessions: 1,
    session_validity_days: null,
    min_age: null,
    audience: "todos",
    price: 180,
    cost: 0,
    commission_pct: 0,
    tax_pct: 0,
    margin_pct: 38,
    active: true,
  },
];

/**
 * Lista procedimentos ATIVOS no shape bruto (com id), para exibir e editar.
 * Mock no modo demo; banco quando configurado (RLS staff).
 */
async function listProcedureRows(): Promise<ProcedureRow[]> {

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("procedures")
    .select(PROC_COLS)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as ProcedureRow[];
}

export default async function ProcedimentosPage() {
  // Módulo gestor-only (contém precificação/margem/receita).
  if (!(await isGestor())) {
    return (
      <RestritoGestor
        title="Procedimentos Médicos"
        subtitle="Gerencie o catálogo completo de procedimentos da clínica"
      />
    );
  }

  const [procedimentos, profissionais, insumos, instrumentais] =
    await Promise.all([
      listProcedureRows(),
      listProfessionals(),
      listStockProducts(),
      listInstrumentais(),
    ]);

  // Vínculos das abas B/C/E (profissionais/materiais/orientações) por procedimento,
  // para pré-preencher o modal de edição.
  const relacoes = await loadProcedureRelations(procedimentos.map((p) => p.id));

  const profOptions = profissionais.map((p) => ({
    id: p.id,
    nome: p.nome,
    especialidade: p.especialidade,
  }));
  const insumoOptions = insumos.map((i) => ({
    id: i.id,
    nome: i.produto,
    unidade: i.unidade,
  }));

  // KPIs calculados a partir dos dados (lista já restrita a ativos)
  const total = procedimentos.length;
  const ativos = procedimentos.filter((p) => p.active).length;
  const ticketMedio = total
    ? procedimentos.reduce((s, p) => s + Number(p.price ?? 0), 0) / total
    : 0;
  const margemMedia = total
    ? procedimentos.reduce((s, p) => s + Number(p.margin_pct ?? 0), 0) / total
    : 0;

  return (
    <>
      <PageHeader
        title="Procedimentos Médicos"
        subtitle="Gerencie o catálogo completo de procedimentos da clínica"
        actions={
          <NovoProcedimentoModal
            profissionais={profOptions}
            insumos={insumoOptions}
            instrumentais={instrumentais}
          />
        }
      />

      {/* KPIs */}
      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FadeInUp>
          <StatCard
            icon={<ClipboardList className="h-5 w-5" />}
            value={String(total)}
            label="Total de Procedimentos"
            tone="neutral"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            value={String(ativos)}
            label="Procedimentos Ativos"
            tone="success"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<DollarSign className="h-5 w-5" />}
            value={moedaBR(ticketMedio)}
            label="Ticket Médio"
            tone="success"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            value={`${Math.round(margemMedia)}%`}
            label="Margem Média"
            tone="success"
          />
        </FadeInUp>
      </Stagger>

      {/* Filtros + tabela (busca/categoria funcionais — estado no client). */}
      <ProcedimentosTabela
        procedimentos={procedimentos}
        profissionais={profOptions}
        insumos={insumoOptions}
        instrumentais={instrumentais}
        relations={relacoes}
      />
    </>
  );
}
