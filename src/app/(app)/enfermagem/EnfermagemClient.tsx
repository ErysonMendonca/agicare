"use client";

import { useState } from "react";
import {
  HeartPulse,
  NotebookPen,
  ClipboardCheck,
  Droplets,
  Activity,
  Gauge,
  Syringe,
  Brain,
  type LucideIcon,
} from "lucide-react";
import {
  type SinalVital,
  type AnotacaoEnfermagem,
  type Cuidado,
  type BalancoHidrico,
  type EvolucaoEnfermagem,
  type EscalaRegistro,
  type ProcedimentoEnfermagem,
  type RegistroSae,
  type OpcaoPaciente,
} from "@/lib/data/enfermagem";
import { SinaisVitaisTab } from "./SinaisVitaisTab";
import { AnotacaoTab } from "./AnotacaoTab";
import { ChecagemTab } from "./ChecagemTab";
import { BalancoTab } from "./BalancoTab";
import { EvolucaoTab } from "./EvolucaoTab";
import { EscalasTab } from "./EscalasTab";
import { ProcedimentosTab } from "./ProcedimentosTab";
import { SaeTab } from "./SaeTab";

type TabKey =
  | "sinais"
  | "anotacao"
  | "checagem"
  | "balanco"
  | "evolucao"
  | "escalas"
  | "procedimentos"
  | "sae";

const ABAS: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: "sinais", label: "Sinais Vitais", icon: HeartPulse },
  { key: "anotacao", label: "Anotação", icon: NotebookPen },
  { key: "checagem", label: "Checagem", icon: ClipboardCheck },
  { key: "balanco", label: "Balanço Hídrico", icon: Droplets },
  { key: "evolucao", label: "Evolução", icon: Activity },
  { key: "escalas", label: "Escalas", icon: Gauge },
  { key: "procedimentos", label: "Procedimentos", icon: Syringe },
  { key: "sae", label: "SAE", icon: Brain },
];

export function EnfermagemClient({
  pacientes,
  sinais,
  anotacoes,
  proximoCodigo,
  cuidados,
  balanco,
  evolucoes,
  escalas,
  procedimentos,
  sae,
}: {
  pacientes: OpcaoPaciente[];
  sinais: SinalVital[];
  anotacoes: AnotacaoEnfermagem[];
  proximoCodigo: string;
  cuidados: Cuidado[];
  balanco: BalancoHidrico | null;
  evolucoes: EvolucaoEnfermagem[];
  escalas: EscalaRegistro[];
  procedimentos: ProcedimentoEnfermagem[];
  sae: RegistroSae[];
}) {
  const [aba, setAba] = useState<TabKey>("sinais");

  return (
    <>
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

      {aba === "sinais" && (
        <SinaisVitaisTab sinais={sinais} pacientes={pacientes} />
      )}
      {aba === "anotacao" && (
        <AnotacaoTab
          anotacoes={anotacoes}
          pacientes={pacientes}
          proximoCodigo={proximoCodigo}
        />
      )}
      {aba === "checagem" && <ChecagemTab cuidados={cuidados} />}
      {aba === "balanco" && (
        <BalancoTab balanco={balanco} pacientes={pacientes} />
      )}
      {aba === "evolucao" && (
        <EvolucaoTab evolucoes={evolucoes} pacientes={pacientes} />
      )}
      {aba === "escalas" && (
        <EscalasTab escalas={escalas} pacientes={pacientes} />
      )}
      {aba === "procedimentos" && (
        <ProcedimentosTab procedimentos={procedimentos} pacientes={pacientes} />
      )}
      {aba === "sae" && <SaeTab registros={sae} pacientes={pacientes} />}
    </>
  );
}
