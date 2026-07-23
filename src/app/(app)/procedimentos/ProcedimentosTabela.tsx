"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, Clock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import {
  ProcedimentoAcoes,
  type ProcedureRow,
  type ProcedureRelations,
} from "./NovoProcedimentoModal";

type ProfOption = { id: string; nome: string; especialidade: string };
type InsumoOption = { id: string; nome: string; unidade: string };
type InstrumentalOption = { id: string; nome: string };

/** Formata moeda com centavos (coluna Valor da tabela). */
const moedaBR2 = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Lista de procedimentos com busca (nome/código) e filtro de categoria
 * FUNCIONAIS (estado local). O fetch acontece no Server Component (page.tsx)
 * e os dados chegam por props; aqui só filtramos a exibição.
 */
export function ProcedimentosTabela({
  procedimentos,
  profissionais,
  insumos,
  instrumentais,
  relations,
}: {
  procedimentos: ProcedureRow[];
  profissionais: ProfOption[];
  insumos: InsumoOption[];
  instrumentais: InstrumentalOption[];
  relations: Record<string, ProcedureRelations>;
}) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todas");

  // Categorias presentes nos dados → opções do filtro (sem inventar valores).
  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const p of procedimentos) if (p.category) set.add(p.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [procedimentos]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return procedimentos.filter((p) => {
      const casaBusca =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q);
      const casaCat = categoria === "todas" || p.category === categoria;
      return casaBusca && casaCat;
    });
  }, [procedimentos, busca, categoria]);

  return (
    <>
      {/* Filtros */}
      <Card className="mt-6 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Buscar por nome ou código do procedimento..."
            className="pl-10"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="relative mt-3">
          <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Select
            className="pl-10 text-center"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            <option value="todas">Todas as Categorias</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {/* Tabela */}
      <Stagger className="mt-6">
        <FadeInUp>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-muted">
                  <th className="px-5 py-3 font-medium">Código</th>
                  <th className="px-5 py-3 font-medium">Nome</th>
                  <th className="px-5 py-3 font-medium">Categoria</th>
                  <th className="px-5 py-3 font-medium">Duração</th>
                  <th className="px-5 py-3 font-medium">Valor</th>
                  <th className="px-5 py-3 font-medium">Margem</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-10 text-center text-sm text-muted"
                    >
                      Nenhum procedimento encontrado.
                    </td>
                  </tr>
                ) : (
                  filtrados.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-line last:border-0"
                    >
                      <td className="px-5 py-4">
                        <Badge status="active">{p.code}</Badge>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-ink">{p.name}</div>
                        <div className="mt-0.5 max-w-xs truncate text-xs text-muted">
                          {p.description}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <Badge status="active">{p.category ?? "—"}</Badge>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 text-muted">
                          <Clock className="h-4 w-4" /> {p.duration_min ?? 0}min
                        </span>
                      </td>
                      <td className="px-5 py-4 font-medium text-ink">
                        {moedaBR2(Number(p.price ?? 0))}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium text-muted">
                          {p.margin_pct ?? 0}%
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <Badge status="ok">
                          {p.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        <ProcedimentoAcoes
                          procedure={p}
                          profissionais={profissionais}
                          insumos={insumos}
                          instrumentais={instrumentais}
                          relations={relations[p.id]}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </FadeInUp>
      </Stagger>
    </>
  );
}
