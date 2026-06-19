import {
  Boxes,
  ClipboardList,
  AlertCircle,
  ShoppingCart,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { isGestor, getRole } from "@/lib/auth";
import {
  listStockProducts,
  listSuppliers,
  listDispensacoes,
  listEntradas,
  listCompras,
  listItensInventario,
  listInventarios,
} from "@/lib/data/stock";
import { listPatients } from "@/lib/data/patients";
import { requireView } from "@/lib/permissions";
import { EstoqueClient } from "./EstoqueClient";

export default async function EstoquePage() {
  await requireView("estoque");
  const [
    produtos,
    fornecedores,
    dispensacoes,
    entradas,
    compras,
    itensInventario,
    inventarios,
    pacientes,
    gestor,
    role,
  ] = await Promise.all([
    listStockProducts(),
    listSuppliers(),
    listDispensacoes(),
    listEntradas(),
    listCompras(),
    listItensInventario(),
    listInventarios(),
    listPatients(),
    isGestor(),
    getRole(),
  ]);

  // Fluxo "por prescrição" só p/ equipe clínica (RLS esconde prescrições dos
  // demais papéis — LGPD). Recepção cria dispensação só por setor.
  const podePrescricao = role === "admin" || role === "medico";

  // KPIs reais derivados dos dados.
  const totalProdutos = produtos.length;
  const totalCriticos = produtos.filter((p) => p.saldo < p.minimo).length;
  const solicitacoesPendentes = dispensacoes.filter(
    (d) => d.statusRaw === "pendente",
  ).length;
  const comprasPendentes = compras.filter(
    (c) => c.statusRaw === "solicitado" || c.statusRaw === "cotacao",
  ).length;

  return (
    <>
      <PageHeader
        title="Controle de Estoque"
        subtitle="Gestão completa de estoque, materiais e medicamentos"
      />

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FadeInUp>
          <StatCard
            icon={<Boxes className="h-5 w-5" />}
            value={String(totalProdutos)}
            label="Total de Produtos"
            tone="neutral"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<ClipboardList className="h-5 w-5" />}
            value={String(solicitacoesPendentes)}
            label="Solicitações Pendentes"
            tone="warn"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<AlertCircle className="h-5 w-5" />}
            value={String(totalCriticos)}
            label="Itens Críticos"
            tone="danger"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<ShoppingCart className="h-5 w-5" />}
            value={String(comprasPendentes)}
            label="Compras Pendentes"
            tone="warn"
          />
        </FadeInUp>
      </Stagger>

      <EstoqueClient
        produtos={produtos}
        fornecedores={fornecedores}
        dispensacoes={dispensacoes}
        entradas={entradas}
        compras={compras}
        itensInventario={itensInventario}
        inventarios={inventarios}
        pacientes={pacientes}
        gestor={gestor}
        podePrescricao={podePrescricao}
      />
    </>
  );
}
