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
import { listSolicitacoes } from "@/lib/data/product-requests";
import { requireView } from "@/lib/permissions";
import { EstoqueClient, type TabKey } from "./EstoqueClient";

const ABA_KEYS: TabKey[] = [
  "cadastro",
  "dispensacao",
  "entrada",
  "inventario",
  "compras",
  "solicitacoes",
  "relatorios",
];

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  try {
    await requireView("estoque");
    const { aba } = await searchParams;
    const abaInicial = ABA_KEYS.includes(aba as TabKey) ? (aba as TabKey) : undefined;
    const [
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
      listSolicitacoes(),
      isGestor(),
      getRole(),
    ]);

    // Fluxo "por prescrição" só p/ equipe clínica (RLS esconde prescrições dos
    // demais papéis — LGPD). Recepção cria dispensação só por setor.
    const podePrescricao = role === "admin" || role === "medico";

    // KPIs reais derivados dos dados.
    const totalProdutos = produtos.length;
    const totalCriticos = produtos.filter((p) => p.saldo < p.minimo).length;
    // Pendentes de ATENDER (pedidos de setor, tela "Solicitações") — antes
    // contava por engano as dispensações pendentes, por isso o card ficava
    // zerado mesmo com pedidos aguardando atendimento na lista abaixo.
    // "Parcial" continua precisando de ação, por isso soma no mesmo contador
    // (mesma regra do badge da aba "Solicitações", ver EstoqueClient).
    const solicitacoesPendentes = solicitacoes.filter(
      (s) => s.statusRaw === "pendente" || s.statusRaw === "atendida_parcial",
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
          solicitacoes={solicitacoes}
          gestor={gestor}
          podePrescricao={podePrescricao}
          abaInicial={abaInicial}
        />
      </>
    );
  } catch (err: any) {
    if (err.message && err.message === 'NEXT_REDIRECT') throw err; // Allow Next.js redirects to bubble
    return (
      <div style={{ padding: 20, background: 'red', color: 'white' }}>
        <h2>SSR CRASH IN EstoquePage</h2>
        <pre>{err.message || String(err)}</pre>
        <pre>{err.stack}</pre>
      </div>
    );
  }
}
