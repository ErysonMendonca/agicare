"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Brain, Clock, BadgeCheck, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import {
  type RegistroSae,
  type OpcaoPaciente,
} from "@/lib/data/enfermagem";
import { registrarSae } from "@/lib/actions/enfermagem";
import { EmptyState, PacienteSelect } from "./Shared";

/** Diagnósticos NANDA comuns para acelerar o preenchimento. */
const DIAGNOSTICOS = [
  "Risco de integridade da pele prejudicada",
  "Mobilidade física prejudicada",
  "Risco de infecção",
  "Dor aguda",
  "Padrão respiratório ineficaz",
  "Risco de queda",
  "Déficit no autocuidado",
];

export function SaeTab({
  registros,
  pacientes,
}: {
  registros: RegistroSae[];
  pacientes: OpcaoPaciente[];
}) {
  const [pacienteId, setPacienteId] = useState("");
  const [coren, setCoren] = useState("");
  const [diagnostico, setDiagnostico] = useState("");
  const [fator, setFator] = useState("");
  const [prescricao, setPrescricao] = useState("");
  const [frequencia, setFrequencia] = useState("6");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSalvar() {
    if (!pacienteId) {
      toast.error("Selecione o paciente.");
      return;
    }
    if (!diagnostico.trim() || !prescricao.trim()) {
      toast.error("Informe o diagnóstico e a prescrição.");
      return;
    }
    startTransition(async () => {
      const res = await registrarSae({
        patient_id: pacienteId,
        coren,
        nanda_diagnosis: diagnostico,
        related_factor: fator,
        prescription: prescricao,
        frequency_hours: frequencia,
      });
      if (res?.ok) {
        toast.success("SAE registrada. Horários gerados na Checagem.");
        setPacienteId("");
        setFator("");
        setPrescricao("");
        setDiagnostico("");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível registrar.");
      }
    });
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
      <Card className="p-5 lg:col-span-2">
        <h2 className="text-lg font-semibold text-ink">
          Sistematização da Assistência (NANDA)
        </h2>
        <p className="mt-1 text-sm text-muted">
          Ao salvar, os horários da prescrição são gerados na tela de Checagem.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <PacienteSelect
            pacientes={pacientes}
            value={pacienteId}
            onChange={setPacienteId}
          />
          <label htmlFor="sae-diagnostico" className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Diagnóstico NANDA <span className="text-red-500">*</span>
            </span>
            <Select
              id="sae-diagnostico"
              value={diagnostico}
              onChange={(e) => setDiagnostico(e.target.value)}
            >
              <option value="">Selecione...</option>
              {DIAGNOSTICOS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </label>
          <label htmlFor="sae-fator" className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Fator relacionado
            </span>
            <textarea
              id="sae-fator"
              rows={2}
              value={fator}
              onChange={(e) => setFator(e.target.value)}
              className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label htmlFor="sae-prescricao" className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Prescrição de enfermagem <span className="text-red-500">*</span>
            </span>
            <textarea
              id="sae-prescricao"
              rows={3}
              value={prescricao}
              onChange={(e) => setPrescricao(e.target.value)}
              className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label htmlFor="sae-frequencia" className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Frequência (horas)
              </span>
              <Select
                id="sae-frequencia"
                value={frequencia}
                onChange={(e) => setFrequencia(e.target.value)}
              >
                {["2", "4", "6", "8", "12"].map((h) => (
                  <option key={h} value={h}>
                    A cada {h}h
                  </option>
                ))}
              </Select>
            </label>
            <Input label="COREN" value={coren} onChange={(e) => setCoren(e.target.value)} />
          </div>
          <Button onClick={handleSalvar} disabled={pending} className="self-start">
            <Brain className="h-4 w-4" />
            Salvar SAE
          </Button>
        </div>
      </Card>

      <div className="flex flex-col gap-3 lg:col-span-3">
        <h2 className="text-lg font-semibold text-ink">Diagnósticos ativos</h2>
        {registros.length === 0 ? (
          <EmptyState
            icon={<Brain className="h-7 w-7" />}
            title="Nenhum diagnóstico SAE registrado"
          />
        ) : (
          <Stagger className="flex flex-col gap-3">
            {registros.map((r) => (
              <FadeInUp key={r.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-ink">{r.diagnostico}</h3>
                    <span className="flex items-center gap-1.5 text-sm text-muted">
                      <Clock className="h-4 w-4" /> {r.data}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    <span className="font-medium text-ink">Paciente: </span>
                    {r.paciente}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    <span className="font-medium text-ink">
                      Fator relacionado:{" "}
                    </span>
                    {r.fatorRelacionado}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    <span className="font-medium text-ink">Prescrição: </span>
                    {r.prescricao}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                    <span className="flex items-center gap-1.5">
                      <Repeat className="h-4 w-4" /> A cada {r.frequencia}h
                    </span>
                    <span className="flex items-center gap-1.5">
                      <BadgeCheck className="h-4 w-4" /> {r.coren}
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
