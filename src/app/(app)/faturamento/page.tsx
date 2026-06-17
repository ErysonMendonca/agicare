import { Lock } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/Card";
import { CountUp } from "@/components/ui/CountUp";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import {
  listBillableEvents,
  listTissGuides,
  listTissBatches,
} from "@/lib/data/billing";
import { isGestor } from "@/lib/auth";
import { requireView } from "@/lib/permissions";
import { FaturamentoClient } from "./FaturamentoClient";

/** Formata um número em moeda R$ pt-BR. */
function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default async function FaturamentoPage() {
  await requireView("faturamento");
  const [eventos, guias, lotes, gestor] = await Promise.all([
    listBillableEvents(),
    listTissGuides(),
    listTissBatches(),
    isGestor(),
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

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <FadeInUp>
          <Card className="p-5">
            <div className="text-sm text-muted">Total de Eventos</div>
            <div className="mt-3 text-3xl font-bold text-ink">
              <CountUp value={total} />
            </div>
          </Card>
        </FadeInUp>
        <FadeInUp>
          <Card className="p-5">
            <div className="text-sm text-muted">Pendentes</div>
            <div className="mt-3 text-3xl font-bold text-orange-500">
              <CountUp value={pendentes} />
            </div>
          </Card>
        </FadeInUp>
        <FadeInUp>
          <Card className="p-5">
            <div className="text-sm text-muted">Faturados</div>
            <div className="mt-3 text-3xl font-bold text-brand-500">
              <CountUp value={faturados} />
            </div>
          </Card>
        </FadeInUp>
        <FadeInUp>
          <Card className="p-5">
            <div className="text-sm text-muted">Glosados</div>
            <div className="mt-3 text-3xl font-bold text-red-500">
              <CountUp value={glosados} />
            </div>
          </Card>
        </FadeInUp>
        <FadeInUp>
          {gestor ? (
            <Card className="border-brand-200 bg-brand-50 p-5">
              <div className="text-sm text-brand-700">Valor Total</div>
              <div className="mt-3 text-3xl font-bold text-brand-600">
                <CountUp value={formatBRL(valorTotal)} />
              </div>
            </Card>
          ) : (
            <Card className="flex flex-col justify-center p-5">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Lock className="h-4 w-4" /> Valor Total
              </div>
              <div className="mt-3 text-base font-medium text-muted">
                Restrito ao gestor
              </div>
            </Card>
          )}
        </FadeInUp>
      </Stagger>

      <FaturamentoClient
        eventos={eventos}
        guias={guias}
        lotes={lotes}
        gestor={gestor}
      />
    </>
  );
}
