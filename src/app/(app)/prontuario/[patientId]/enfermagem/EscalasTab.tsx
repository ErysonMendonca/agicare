"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gauge, Clock, User, Calculator } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import {
  type EscalaRegistro,
  type OpcaoPaciente,
} from "@/lib/data/enfermagem";
import { registrarEscala } from "@/lib/actions/enfermagem";
import { EmptyState, PacienteSelect } from "./Shared";

type ScaleKey = "glasgow" | "fugulin" | "braden";

type Criterio = {
  id: string;
  label: string;
  opcoes: { label: string; valor: number }[];
};

type EscalaDef = {
  key: ScaleKey;
  nome: string;
  curto: string;
  criterios: Criterio[];
  classificar: (total: number) => string;
};

const op = (pares: [string, number][]) =>
  pares.map(([label, valor]) => ({ label, valor }));

const ESCALAS: Record<ScaleKey, EscalaDef> = {
  glasgow: {
    key: "glasgow",
    nome: "Escala de Coma de Glasgow",
    curto: "Glasgow",
    criterios: [
      {
        id: "ocular",
        label: "Abertura ocular",
        opcoes: op([
          ["Espontânea", 4],
          ["Ao estímulo verbal", 3],
          ["À dor", 2],
          ["Nenhuma", 1],
        ]),
      },
      {
        id: "verbal",
        label: "Resposta verbal",
        opcoes: op([
          ["Orientado", 5],
          ["Confuso", 4],
          ["Palavras inapropriadas", 3],
          ["Sons incompreensíveis", 2],
          ["Nenhuma", 1],
        ]),
      },
      {
        id: "motora",
        label: "Resposta motora",
        opcoes: op([
          ["Obedece comandos", 6],
          ["Localiza a dor", 5],
          ["Flexão normal", 4],
          ["Flexão anormal", 3],
          ["Extensão", 2],
          ["Nenhuma", 1],
        ]),
      },
    ],
    classificar: (t) =>
      t === 15
        ? "Sem alteração de consciência"
        : t >= 13
          ? "TCE leve"
          : t >= 9
            ? "TCE moderado"
            : "TCE grave (coma)",
  },
  braden: {
    key: "braden",
    nome: "Escala de Braden (risco de lesão por pressão)",
    curto: "Braden",
    criterios: [
      {
        id: "percepcao",
        label: "Percepção sensorial",
        opcoes: op([
          ["Nenhuma limitação", 4],
          ["Levemente limitada", 3],
          ["Muito limitada", 2],
          ["Totalmente limitada", 1],
        ]),
      },
      {
        id: "umidade",
        label: "Umidade",
        opcoes: op([
          ["Raramente úmida", 4],
          ["Ocasionalmente úmida", 3],
          ["Muito úmida", 2],
          ["Constantemente úmida", 1],
        ]),
      },
      {
        id: "atividade",
        label: "Atividade",
        opcoes: op([
          ["Anda frequentemente", 4],
          ["Anda ocasionalmente", 3],
          ["Restrito à cadeira", 2],
          ["Acamado", 1],
        ]),
      },
      {
        id: "mobilidade",
        label: "Mobilidade",
        opcoes: op([
          ["Não limitada", 4],
          ["Levemente limitada", 3],
          ["Muito limitada", 2],
          ["Totalmente imóvel", 1],
        ]),
      },
      {
        id: "nutricao",
        label: "Nutrição",
        opcoes: op([
          ["Excelente", 4],
          ["Adequada", 3],
          ["Provavelmente inadequada", 2],
          ["Muito pobre", 1],
        ]),
      },
      {
        id: "friccao",
        label: "Fricção e cisalhamento",
        opcoes: op([
          ["Sem problema aparente", 3],
          ["Problema potencial", 2],
          ["Problema", 1],
        ]),
      },
    ],
    classificar: (t) =>
      t >= 19
        ? "Sem risco"
        : t >= 15
          ? "Risco baixo"
          : t >= 13
            ? "Risco moderado"
            : t >= 10
              ? "Risco alto"
              : "Risco muito alto",
  },
  fugulin: {
    key: "fugulin",
    nome: "Escala de Fugulin (grau de dependência)",
    curto: "Fugulin",
    criterios: [
      "Estado mental",
      "Oxigenação",
      "Sinais vitais",
      "Motilidade",
      "Deambulação",
      "Alimentação",
      "Cuidado corporal",
      "Eliminação",
      "Terapêutica",
    ].map((label, i) => ({
      id: `f${i}`,
      label,
      opcoes: op([
        ["Independente / mínimo", 1],
        ["Ajuda parcial", 2],
        ["Ajuda significativa", 3],
        ["Dependência total", 4],
      ]),
    })),
    classificar: (t) =>
      t <= 14
        ? "Cuidados mínimos"
        : t <= 20
          ? "Cuidados intermediários"
          : t <= 26
            ? "Cuidados de alta dependência"
            : t <= 31
              ? "Cuidados semi-intensivos"
              : "Cuidados intensivos",
  },
};

function initSelecao(def: EscalaDef): Record<string, number> {
  return Object.fromEntries(
    def.criterios.map((c) => [c.id, c.opcoes[0].valor]),
  );
}

export function EscalasTab({
  escalas,
  pacientes,
}: {
  escalas: EscalaRegistro[];
  pacientes: OpcaoPaciente[];
}) {
  const [scale, setScale] = useState<ScaleKey>("glasgow");
  const [pacienteId, setPacienteId] = useState("");
  const [selecao, setSelecao] = useState<Record<string, number>>(() =>
    initSelecao(ESCALAS.glasgow),
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const def = ESCALAS[scale];

  const total = useMemo(
    () => Object.values(selecao).reduce((s, v) => s + v, 0),
    [selecao],
  );
  const classificacao = def.classificar(total);

  function trocarEscala(key: ScaleKey) {
    setScale(key);
    setSelecao(initSelecao(ESCALAS[key]));
  }

  function handleSalvar() {
    if (!pacienteId) {
      toast.error("Selecione o paciente.");
      return;
    }
    startTransition(async () => {
      const res = await registrarEscala({
        patient_id: pacienteId,
        scale,
        score: total,
        classification: classificacao,
      });
      if (res?.ok) {
        toast.success("Escala registrada.");
        setPacienteId("");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível registrar.");
      }
    });
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
      <Card className="p-5 lg:col-span-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ESCALAS) as ScaleKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => trocarEscala(key)}
              className={
                scale === key
                  ? "rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-muted hover:text-ink"
              }
            >
              {ESCALAS[key].curto}
            </button>
          ))}
        </div>

        <h2 className="mt-4 text-lg font-semibold text-ink">{def.nome}</h2>

        <div className="mt-4 flex flex-col gap-4">
          <PacienteSelect
            pacientes={pacientes}
            value={pacienteId}
            onChange={setPacienteId}
          />
          {def.criterios.map((c) => (
            <Select
              key={c.id}
              label={c.label}
              value={String(selecao[c.id])}
              onChange={(e) =>
                setSelecao((s) => ({ ...s, [c.id]: Number(e.target.value) }))
              }
            >
              {c.opcoes.map((o) => (
                <option key={o.label} value={o.valor}>
                  {o.label} ({o.valor})
                </option>
              ))}
            </Select>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-50 p-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white">
              <Calculator className="h-5 w-5" />
            </span>
            <div>
              <div className="text-2xl font-bold text-ink">{total} pontos</div>
              <div className="text-sm font-medium text-brand-600">
                {classificacao}
              </div>
            </div>
          </div>
          <Button onClick={handleSalvar} disabled={pending}>
            Registrar escala
          </Button>
        </div>
      </Card>

      <div className="flex flex-col gap-3 lg:col-span-2">
        <h2 className="text-lg font-semibold text-ink">Histórico</h2>
        {escalas.length === 0 ? (
          <EmptyState
            icon={<Gauge className="h-7 w-7" />}
            title="Nenhuma escala aplicada"
          />
        ) : (
          <Stagger className="flex flex-col gap-3">
            {escalas.map((e) => (
              <FadeInUp key={e.id}>
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <Badge status="active">{e.escala}</Badge>
                    <span className="text-lg font-bold text-ink">
                      {e.pontuacao}
                    </span>
                  </div>
                  <h3 className="mt-2 font-semibold text-ink">{e.paciente}</h3>
                  <p className="text-sm font-medium text-brand-600">
                    {e.classificacao}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" /> {e.data}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <User className="h-4 w-4" /> {e.profissional}
                    </span>
                  </div>
                </Card>
              </FadeInUp>
            ))}
          </Stagger>
        )}
      </div>
    </div>
  );
}
