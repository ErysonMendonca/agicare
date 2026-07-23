"use client";

import { useState } from "react";
import {
  Boxes,
  PackageCheck,
  ArrowDownToLine,
  ClipboardCheck,
  FileBarChart,
  ShoppingCart,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import {
  type ProdutoEstoque,
  type Fornecedor,
  type Dispensacao,
  type EntradaProduto,
  type SolicitacaoCompra,
  type ItemInventario,
  type InventarioAberto,
} from "@/lib/data/stock";
import { type Paciente } from "@/lib/data/patients";
import { type SolicitacaoProduto } from "@/lib/data/product-requests.shared";
import { CadastroTab } from "./CadastroTab";
import { DispensacaoTab } from "./DispensacaoTab";
import { EntradaTab } from "./EntradaTab";
import { InventarioTab } from "./InventarioTab";
import { ComprasTab } from "./ComprasTab";
import { RelatoriosTab } from "./RelatoriosTab";
import { SolicitacoesEstoqueTab } from "./SolicitacoesEstoqueTab";

export type TabKey =
  | "cadastro"
  | "dispensacao"
  | "entrada"
  | "inventario"
  | "compras"
  | "solicitacoes"
  | "relatorios";

const ABAS: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: "cadastro", label: "Cadastro", icon: Boxes },
  { key: "dispensacao", label: "Dispensação", icon: PackageCheck },
  { key: "entrada", label: "Entrada", icon: ArrowDownToLine },
  { key: "inventario", label: "Inventário", icon: ClipboardCheck },
  { key: "compras", label: "Compras", icon: ShoppingCart },
  { key: "solicitacoes", label: "Solicitações", icon: ClipboardList },
  { key: "relatorios", label: "Relatórios", icon: FileBarChart },
];

export function EstoqueClient({
  produtos,
  fornecedores,
  dispensacoes,
  entradas,
  compras,
  itensInventario,
  inventarios,
  pacientes,
  solicitacoes,
  gestor,
  podePrescricao,
  abaInicial,
}: {
  produtos: ProdutoEstoque[];
  fornecedores: Fornecedor[];
  dispensacoes: Dispensacao[];
  entradas: EntradaProduto[];
  compras: SolicitacaoCompra[];
  itensInventario: ItemInventario[];
  inventarios: InventarioAberto[];
  pacientes: Paciente[];
  solicitacoes: SolicitacaoProduto[];
  gestor: boolean;
  podePrescricao: boolean;
  /** Aba a abrir de cara (ex.: "solicitacoes") — lida do ?aba= pelo Server
   * Component (page.tsx). Usada pelo "Voltar" da página de atendimento, que
   * precisa devolver a pessoa para a mesma aba de onde ela saiu. */
  abaInicial?: TabKey;
}) {
  const [aba, setAba] = useState<TabKey>(abaInicial ?? "dispensacao");

  // Pendentes de atender (todos os setores) — sinaliza no rótulo da aba
  // "Solicitações" para quem atende (Almoxarifado, Farmácia, etc.) ver de
  // cara que há pedido novo, sem precisar abrir a aba. "Parcial" continua
  // precisando de ação, por isso soma no mesmo contador.
  const solicitacoesPendentes = solicitacoes.filter(
    (s) => s.statusRaw === "pendente" || s.statusRaw === "atendida_parcial",
  ).length;

  return (
    <>
      {/* Abas de módulos do estoque */}
      <div className="mt-6 flex flex-wrap gap-2">
        {ABAS.map(({ key, label, icon: Icone }) => {
          const ativa = aba === key;
          const badge = key === "solicitacoes" ? solicitacoesPendentes : 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setAba(key)}
              className={
                ativa
                  ? "inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white"
                  : "inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-ink"
              }
            >
              <Icone className="h-4 w-4" />
              {label}
              {badge > 0 && (
                <span
                  className={
                    ativa
                      ? "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs font-semibold text-brand-600"
                      : "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-secondary"
                  }
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {aba === "cadastro" && (
        <CadastroTab
          produtos={produtos}
          fornecedores={fornecedores}
          gestor={gestor}
        />
      )}
      {aba === "dispensacao" && (
        <DispensacaoTab
          pedidos={dispensacoes}
          produtos={produtos}
          pacientes={pacientes}
          podePrescricao={podePrescricao}
        />
      )}
      {aba === "entrada" && (
        <EntradaTab
          entradas={entradas}
          fornecedores={fornecedores}
          produtos={produtos}
          gestor={gestor}
        />
      )}
      {aba === "inventario" && (
        <InventarioTab itens={itensInventario} inventarios={inventarios} />
      )}
      {aba === "compras" && <ComprasTab compras={compras} gestor={gestor} />}
      {aba === "solicitacoes" && (
        <SolicitacoesEstoqueTab solicitacoes={solicitacoes} />
      )}
      {aba === "relatorios" && (
        <RelatoriosTab produtos={produtos} gestor={gestor} />
      )}
    </>
  );
}
