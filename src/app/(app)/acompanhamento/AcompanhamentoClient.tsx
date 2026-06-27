"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Search,
  Hash,
  CircleCheck,
  CircleDot,
  Circle,
  MapPin,
  ArrowRight,
  SearchX,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { type Acompanhamento } from "@/lib/data/queue";

const ease = [0.22, 1, 0.36, 1] as const;

/** Formata um ISO em "HH:MM" (hora local); vazio se inválido. */
function horaCurta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Busca de atendimento por número (6 dígitos) + linha do tempo das etapas.
 * A busca navega por query string (?codigo=) e o servidor faz o lookup —
 * este client só controla o input e anima o resultado.
 */
export function AcompanhamentoClient({
  codigo,
  resultado,
}: {
  /** Código pesquisado (vem do searchParams). */
  codigo: string;
  /** Resultado do lookup no servidor; null quando nada foi buscado ainda. */
  resultado: Acompanhamento | null;
}) {
  const router = useRouter();
  const [valor, setValor] = useState(codigo);
  const [pending, startTransition] = useTransition();

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const limpo = valor.trim();
    startTransition(() => {
      router.push(limpo ? `/acompanhamento?codigo=${encodeURIComponent(limpo)}` : "/acompanhamento");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-4">
        <form onSubmit={buscar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Nº do Atendimento
            </span>
            <span className="relative block">
              <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                aria-label="Número do atendimento"
                className="pl-9 tracking-[0.3em]"
              />
            </span>
          </label>
          <Button type="submit" variant="primary" disabled={pending}>
            <Search className="h-4 w-4" />
            {pending ? "Buscando…" : "Buscar"}
          </Button>
        </form>
      </Card>

      {codigo && resultado && !resultado.encontrado && (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <SearchX className="h-8 w-8 text-muted" />
          <p className="font-semibold text-ink">Atendimento não encontrado</p>
          <p className="text-sm text-muted">
            Confira o número informado e tente novamente.
          </p>
        </Card>
      )}

      {resultado?.encontrado && (
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">
                {resultado.paciente}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Hash className="h-4 w-4" /> {resultado.codigo}
                </span>
                <span>Senha {resultado.senha}</span>
              </p>
            </div>
            <Badge status="active">{resultado.statusAtual}</Badge>
          </div>

          {/* Linha do tempo das etapas */}
          <ol className="mt-6 space-y-0">
            {resultado.etapas.map((etapa, i) => {
              const isLast = i === resultado.etapas.length - 1;
              return (
                <motion.li
                  key={etapa.chave}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, ease, delay: i * 0.08 }}
                  className="flex gap-3"
                >
                  <div className="flex flex-col items-center">
                    {etapa.estado === "feito" ? (
                      <CircleCheck className="h-6 w-6 text-green-600" />
                    ) : etapa.estado === "atual" ? (
                      <CircleDot className="h-6 w-6 text-brand-600" />
                    ) : (
                      <Circle className="h-6 w-6 text-muted/50" />
                    )}
                    {!isLast && (
                      <span
                        className={`my-1 w-0.5 flex-1 rounded-full ${
                          etapa.estado === "feito" ? "bg-green-500" : "bg-line"
                        }`}
                      />
                    )}
                  </div>
                  <div className={`pb-6 ${isLast ? "pb-0" : ""}`}>
                    <p
                      className={`text-sm font-semibold ${
                        etapa.estado === "atual"
                          ? "text-brand-600"
                          : etapa.estado === "feito"
                            ? "text-ink"
                            : "text-muted"
                      }`}
                    >
                      {etapa.rotulo}
                    </p>
                    {etapa.em && horaCurta(etapa.em) && (
                      <p className="text-xs text-muted">{horaCurta(etapa.em)}</p>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </ol>

          <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row">
            {resultado.proximoPasso && (
              <div className="flex flex-1 items-center gap-2 rounded-xl bg-brand-50 px-4 py-3">
                <ArrowRight className="h-4 w-4 text-brand-600" />
                <span className="text-sm">
                  <span className="text-muted">Próximo passo: </span>
                  <span className="font-semibold text-brand-700">
                    {resultado.proximoPasso}
                  </span>
                </span>
              </div>
            )}
            {resultado.ondeRegistrado && (
              <div className="flex flex-1 items-center gap-2 rounded-xl bg-muted-surface px-4 py-3">
                <MapPin className="h-4 w-4 text-muted" />
                <span className="text-sm">
                  <span className="text-muted">Onde está registrado: </span>
                  <span className="font-semibold text-ink">
                    {resultado.ondeRegistrado}
                  </span>
                </span>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
