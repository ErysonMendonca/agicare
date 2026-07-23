import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { requireView } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { listStockProducts } from "@/lib/data/stock";
import {
  getSolicitacao,
  listAtendimentosSolicitacao,
} from "@/lib/data/product-requests";
import { AtenderRequisicaoClient } from "./AtenderRequisicaoClient";

export default async function AtenderSolicitacaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireView("estoque");
  const { id } = await params;

  const [solicitacao, produtos, settings, historico, me] = await Promise.all([
    getSolicitacao(id),
    listStockProducts(),
    getSettings(),
    listAtendimentosSolicitacao(id),
    getCurrentUser(),
  ]);

  if (!solicitacao) notFound();

  return (
    <>
      <PageHeader
        title={`Atendimento — ${solicitacao.codigo}`}
        subtitle={`Setor solicitante: ${solicitacao.setor} · Fornecedor: ${solicitacao.setorFornecedor ?? "—"}`}
        actions={
          <Link
            href="/estoque?aba=solicitacoes"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink transition-colors hover:bg-black/5"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        }
      />

      <AtenderRequisicaoClient
        solicitacao={solicitacao}
        produtos={produtos.filter((p) => p.ativo)}
        clinica={{
          nome: settings.clinicName,
          cnpj: settings.cnpj,
          endereco: settings.address,
          telefone: settings.phone,
        }}
        historico={historico}
        atendenteNome={me?.profile?.full_name ?? "—"}
      />
    </>
  );
}
