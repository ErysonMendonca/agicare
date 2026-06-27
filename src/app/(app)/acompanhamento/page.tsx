import { PageHeader } from "@/components/app/PageHeader";
import { requireView } from "@/lib/permissions";
import { getAcompanhamento, type Acompanhamento } from "@/lib/data/queue";
import { AcompanhamentoClient } from "./AcompanhamentoClient";

export default async function AcompanhamentoPage({
  searchParams,
}: {
  // Next.js 16: searchParams é assíncrono.
  searchParams: Promise<{ codigo?: string }>;
}) {
  await requireView("fila");

  const sp = await searchParams;
  const codigo = sp.codigo?.trim() || "";

  // Só consulta quando há um código informado; senão, tela de busca vazia.
  const resultado: Acompanhamento | null = codigo
    ? await getAcompanhamento(codigo)
    : null;

  return (
    <>
      <PageHeader
        title="Acompanhamento"
        subtitle="Busque um atendimento pelo número e veja a etapa atual e o próximo passo"
      />

      <AcompanhamentoClient codigo={codigo} resultado={resultado} />
    </>
  );
}
