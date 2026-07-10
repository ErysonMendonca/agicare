"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Clock,
  User,
  Stethoscope,
  ClipboardList,
  ScrollText,
  Pill,
  FileText,
  FileCheck,
  LogOut,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { cn } from "@/lib/utils";
import type {
  HistoricoAtendimento,
  DocumentoHistorico,
} from "@/lib/data/historico-atendimentos";

/** Ícone por tipo de documento clínico. */
const ICONE_POR_TIPO: Record<DocumentoHistorico["tipo"], LucideIcon> = {
  Anamnese: ClipboardList,
  "Evolução": Stethoscope,
  "Prescrição": Pill,
  Atestado: FileCheck,
  Alta: LogOut,
  Receituário: ScrollText,
  Exame: FlaskConical,
};

/** Formata uma data ISO para dd/mm/aaaa (fallback: valor cru). */
function formatarData(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
}

function AtendimentoCard({
  patientId,
  atendimento,
  aberto,
  onToggle,
}: {
  patientId: string;
  atendimento: HistoricoAtendimento;
  aberto: boolean;
  onToggle: () => void;
}) {
  const semVinculo = atendimento.queueEntryId === null;
  const titulo = semVinculo
    ? "Anteriores / sem atendimento vinculado"
    : `Atendimento ${atendimento.atendimentoCodigo ?? ""}`.trim();

  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberto}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-black/[0.02]"
      >
        <span
          className={cn(
            "flex h-11 w-11 flex-none items-center justify-center rounded-xl",
            semVinculo
              ? "bg-muted-surface text-muted"
              : "bg-brand-50 text-brand-600",
          )}
        >
          <Clock className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h3 className="font-semibold text-ink">{titulo}</h3>
            {!semVinculo && (
              <span className="text-xs text-muted">
                · {formatarData(atendimento.data)}
              </span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            {atendimento.profissional && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {atendimento.profissional}
              </span>
            )}
            {atendimento.especialidade && (
              <span className="inline-flex items-center gap-1">
                <Stethoscope className="h-3.5 w-3.5" />
                {atendimento.especialidade}
              </span>
            )}
            <span>
              {atendimento.documentos.length}{" "}
              {atendimento.documentos.length === 1 ? "documento" : "documentos"}
            </span>
          </p>
        </div>

        <ChevronDown
          className={cn(
            "h-5 w-5 flex-none text-muted transition-transform duration-200",
            aberto && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-line px-5 py-3">
              {atendimento.documentos.length === 0 ? (
                <p className="py-2 text-sm text-muted">
                  Nenhum documento neste atendimento.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {atendimento.documentos.map((doc, i) => {
                    const Icone = ICONE_POR_TIPO[doc.tipo] ?? FileText;
                    return (
                      <li key={`${doc.aba}-${doc.titulo}-${i}`}>
                        <Link
                          href={`/prontuario/${patientId}/${doc.aba}`}
                          className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-brand-50"
                        >
                          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-muted-surface text-muted transition-colors group-hover:bg-white group-hover:text-brand-600">
                            <Icone className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink">
                              {doc.titulo}
                            </p>
                            <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted">
                              <span>
                                {doc.tipo} · {formatarData(doc.data)}
                              </span>
                              {doc.autor && doc.autor !== "—" && (
                                <span className="inline-flex min-w-0 items-center gap-1">
                                  <span aria-hidden>·</span>
                                  <User className="h-3 w-3 flex-none" />
                                  <span className="truncate">{doc.autor}</span>
                                </span>
                              )}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

export function LinhaDoTempoClient({
  patientId,
  atendimentos,
}: {
  patientId: string;
  atendimentos: HistoricoAtendimento[];
}) {
  // Primeiro atendimento aberto por padrão (mais recente).
  const [abertos, setAbertos] = useState<Set<number>>(() => new Set([0]));

  function toggle(index: number) {
    setAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  if (atendimentos.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center px-5 py-12 text-center">
        <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted-surface text-muted">
          <Clock className="h-5 w-5" />
        </span>
        <p className="font-medium text-ink">Nenhum atendimento registrado</p>
        <p className="text-sm text-muted">
          Os documentos gerados nos atendimentos aparecerão aqui, agrupados por
          data.
        </p>
      </Card>
    );
  }

  return (
    <Stagger className="flex flex-col gap-3">
      {atendimentos.map((atendimento, i) => (
        <FadeInUp key={atendimento.queueEntryId ?? `sem-vinculo-${i}`}>
          <AtendimentoCard
            patientId={patientId}
            atendimento={atendimento}
            aberto={abertos.has(i)}
            onToggle={() => toggle(i)}
          />
        </FadeInUp>
      ))}
    </Stagger>
  );
}
