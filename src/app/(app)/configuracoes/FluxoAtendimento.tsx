"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, Save, Workflow, Lock } from "lucide-react";
import { toast } from "sonner";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { salvarFluxo } from "@/lib/actions/settings";
import {
  ALL_STAGES,
  REQUIRED_STAGES,
  sanitizeStages,
  type FlowStage,
} from "@/lib/data/attendance-flow.shared";

const STAGE_META: Record<
  FlowStage,
  { label: string; desc: string; tone: string }
> = {
  recepcao: {
    label: "Recepção",
    desc: "Check-in / emissão de senha — paciente entra na fila.",
    tone: "bg-brand-50 text-brand-600",
  },
  triagem: {
    label: "Triagem",
    desc: "Sinais vitais + classificação de risco (Manchester).",
    tone: "bg-amber-50 text-amber-600",
  },
  atendimento: {
    label: "Atendimento",
    desc: "Chamada e atendimento clínico — etapa final do fluxo.",
    tone: "bg-emerald-50 text-emerald-600",
  },
};

const isRequired = (s: FlowStage) => REQUIRED_STAGES.includes(s);

/**
 * Editor do FLUXO de atendimento (gestor-only). O gestor liga/desliga a triagem
 * e ordena as etapas (setas ↑/↓). Recepção e atendimento são obrigatórias (não
 * podem ser desligadas); a triagem é opcional e reordenável. Persiste via
 * `salvarFluxo` — o servidor sanea (sanitizeStages) e reforça isGestor.
 */
export function FluxoAtendimento({
  stages: stagesIniciais,
  isGestor,
}: {
  stages: FlowStage[];
  isGestor: boolean;
}) {
  // Ordem editável: começa pelo fluxo configurado e completa com as etapas
  // desligadas no fim (para o gestor poder ligá-las).
  const [ordem, setOrdem] = useState<FlowStage[]>(() => {
    const ativas = sanitizeStages(stagesIniciais);
    const inativas = ALL_STAGES.filter((s) => !ativas.includes(s));
    return [...ativas, ...inativas];
  });
  const [ativas, setAtivas] = useState<Set<FlowStage>>(
    () => new Set(sanitizeStages(stagesIniciais)),
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function mover(index: number, dir: -1 | 1) {
    const destino = index + dir;
    if (destino < 0 || destino >= ordem.length) return;
    setOrdem((arr) => {
      const novo = [...arr];
      [novo[index], novo[destino]] = [novo[destino], novo[index]];
      return novo;
    });
  }

  function toggle(stage: FlowStage) {
    if (isRequired(stage)) return; // obrigatórias não desligam
    setAtivas((set) => {
      const novo = new Set(set);
      if (novo.has(stage)) novo.delete(stage);
      else novo.add(stage);
      return novo;
    });
  }

  function salvar() {
    const selecionadas = ordem.filter((s) => ativas.has(s));
    startTransition(async () => {
      const res = await salvarFluxo({ stages: selecionadas });
      if (res?.ok) {
        toast.success("Fluxo de atendimento salvo.");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível salvar o fluxo.");
      }
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardBody>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Workflow className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-ink">Fluxo de Atendimento</h3>
            <p className="text-xs text-muted">
              Ordene as etapas e ligue/desligue a triagem. A ordem é totalmente
              customizável.
            </p>
          </div>
        </div>

        {!isGestor && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-line bg-muted-surface p-3 text-xs text-muted">
            <Lock className="h-4 w-4" /> Apenas o gestor pode alterar o fluxo.
          </div>
        )}

        <ol className="flex flex-col gap-3">
          {ordem.map((stage, i) => {
            const meta = STAGE_META[stage];
            const ligada = ativas.has(stage);
            const required = isRequired(stage);
            return (
              <li
                key={stage}
                className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                  ligada ? "border-line bg-surface" : "border-dashed border-line bg-muted-surface opacity-70"
                }`}
              >
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-canvas text-xs font-bold text-muted">
                  {ligada ? ordem.filter((s) => ativas.has(s)).indexOf(stage) + 1 : "—"}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">
                      {meta.label}
                    </span>
                    {required ? (
                      <span className="rounded-full bg-muted-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                        Obrigatória
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600">
                        Opcional
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{meta.desc}</p>
                </div>

                {/* Toggle on/off (só opcionais) */}
                <label
                  className={`flex flex-none items-center ${
                    required || !isGestor ? "cursor-not-allowed" : "cursor-pointer"
                  }`}
                  title={required ? "Etapa obrigatória" : "Ligar/desligar etapa"}
                >
                  <input
                    type="checkbox"
                    checked={ligada}
                    disabled={required || !isGestor}
                    onChange={() => toggle(stage)}
                    className="h-5 w-5 rounded border-line text-brand-500 focus:ring-brand-100 disabled:opacity-40"
                  />
                </label>

                {/* Reordenar */}
                <div className="flex flex-none flex-col">
                  <button
                    type="button"
                    aria-label={`Mover ${meta.label} para cima`}
                    disabled={i === 0 || !isGestor}
                    onClick={() => mover(i, -1)}
                    className="rounded p-1 text-muted hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Mover ${meta.label} para baixo`}
                    disabled={i === ordem.length - 1 || !isGestor}
                    onClick={() => mover(i, 1)}
                    className="rounded p-1 text-muted hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>

        <p className="mt-4 text-xs text-muted">
          Pré-visualização:{" "}
          <span className="font-medium text-ink">
            {ordem
              .filter((s) => ativas.has(s))
              .map((s) => STAGE_META[s].label)
              .join(" → ")}
          </span>
        </p>

        {isGestor && (
          <div className="mt-5 flex justify-end">
            <Button type="button" variant="primary" onClick={salvar} disabled={pending}>
              <Save className="h-4 w-4" />
              {pending ? "Salvando..." : "Salvar fluxo"}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
