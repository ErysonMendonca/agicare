import { ClipboardList, Clock, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { requireView } from "@/lib/permissions";
import { getRole } from "@/lib/auth";
import { listStockProducts } from "@/lib/data/stock";
import {
  listSolicitacoes,
  listSetoresFornecedor,
  type Setor,
} from "@/lib/data/product-requests";
import { SolicitacoesClient } from "./SolicitacoesClient";

/** Setor default a partir do papel logado (não há papel "farmácia"). */
function setorPadrao(role: string | null): Setor {
  if (role === "recepcao") return "Recepção";
  if (role === "medico") return "Médico";
  return "Farmácia";
}

export default async function SolicitacoesPage() {
  await requireView("solicitacoes");

  // Setor do usuário logado — a tela do solicitante mostra só os pedidos do
  // próprio setor e apenas os de hoje (evita ver "tudo de todos" / lista gigante).
  const role = await getRole();
  const setorUsuario = setorPadrao(role);

  const [produtos, solicitacoes, setoresFornecedor] = await Promise.all([
    listStockProducts(),
    listSolicitacoes({ setor: setorUsuario, apenasHoje: true }),
    listSetoresFornecedor(),
  ]);

  // Só o necessário para o pedido — SEM expor saldo/quantidade em estoque.
  const produtosOpcoes = produtos
    .filter((p) => p.ativo)
    .map((p) => ({ id: p.id, produto: p.produto, unidade: p.unidade }));

  const pendentes = solicitacoes.filter((s) => s.statusRaw === "pendente").length;
  const atendidas = solicitacoes.filter((s) => s.statusRaw === "atendida").length;

  return (
    <>
      <PageHeader
        title="Solicitação de Produtos"
        subtitle={`Pedidos do setor ${setorUsuario} — hoje. O estoque atende a cada pedido.`}
      />

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FadeInUp>
          <StatCard
            icon={<ClipboardList className="h-5 w-5" />}
            value={String(solicitacoes.length)}
            label="Total de Solicitações"
            tone="neutral"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            value={String(pendentes)}
            label="Pendentes"
            tone="warn"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            value={String(atendidas)}
            label="Atendidas"
            tone="success"
          />
        </FadeInUp>
      </Stagger>

      <SolicitacoesClient
        solicitacoes={solicitacoes}
        produtos={produtosOpcoes}
        setorPadrao={setorUsuario}
        setoresFornecedor={setoresFornecedor}
      />
    </>
  );
}
