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

type TabKey =
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
}) {
  const [aba, setAba] = useState<TabKey>("dispensacao");

  return (
    <>
      {/* Abas de módulos do estoque */}
      <div className="mt-6 flex flex-wrap gap-2">
        {ABAS.map(({ key, label, icon: Icone }) => {
          const ativa = aba === key;
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
