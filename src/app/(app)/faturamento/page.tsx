import { PageHeader } from "@/components/app/PageHeader";
import {
  listBillableEvents,
  listTissGuides,
  listTissBatches,
} from "@/lib/data/billing";
import { isGestor } from "@/lib/auth";
import { requireView, can } from "@/lib/permissions";
import { FaturamentoClient } from "./FaturamentoClient";

import { listProcedures } from "@/lib/data/procedures";

/** Formata um número em moeda R$ pt-BR. */
function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default async function FaturamentoPage() {
  await requireView("faturamento");
  const [eventos, guias, lotes, gestor, podeAjustar, procedimentos] =
    await Promise.all([
      listBillableEvents(),
      listTissGuides(),
      listTissBatches(),
      isGestor(),
      can("faturamento_ajustes", "view"),
      listProcedures(),
    ]);

  const total = eventos.length;
  const pendentes = eventos.filter((e) => e.status.tone === "warn").length;
  const faturados = eventos.filter((e) => e.status.tone === "active").length;
  const glosados = eventos.filter((e) => e.status.tone === "danger").length;
  const valorTotal = eventos.reduce((acc, e) => acc + e.valorNumerico, 0);

  return (
    <>
      <PageHeader
        title="Faturamento"
        subtitle="Conferência de check-out, particular, convênio e empresa"
      />

      <FaturamentoClient
        eventos={eventos}
        guias={guias}
        lotes={lotes}
        gestor={gestor}
        podeAjustar={podeAjustar}
        procedimentos={procedimentos}
        kpis={{ total, pendentes, faturados, glosados }}
        valorTotalLabel={formatBRL(valorTotal)}
      />
    </>
  );
}
