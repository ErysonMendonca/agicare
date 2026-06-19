"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Activity, User, Clock, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import {
  type EvolucaoEnfermagem,
  type OpcaoPaciente,
} from "@/lib/data/enfermagem";
import { registrarEvolucao } from "@/lib/actions/enfermagem";
import { EmptyState, PacienteSelect } from "./Shared";

function Bloco({
  id,
  label,
  value,
  onChange,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <textarea
        id={id}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}

export function EvolucaoTab({
  evolucoes,
  pacientes,
}: {
  evolucoes: EvolucaoEnfermagem[];
  pacientes: OpcaoPaciente[];
}) {
  const [pacienteId, setPacienteId] = useState("");
  const [coren, setCoren] = useState("");
  const [avaliacao, setAvaliacao] = useState("");
  const [reavaliacao, setReavaliacao] = useState("");
  const [conduta, setConduta] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSalvar() {
    if (!pacienteId) {
      toast.error("Selecione o paciente.");
      return;
    }
    if (!avaliacao.trim() || !conduta.trim()) {
      toast.error("Preencha a avaliação e a conduta.");
      return;
    }
    startTransition(async () => {
      const res = await registrarEvolucao({
        patient_id: pacienteId,
        coren,
        assessment: avaliacao,
        reassessment: reavaliacao,
        conduct: conduta,
      });
      if (res?.ok) {
        toast.success("Evolução registrada.");
        setAvaliacao("");
        setReavaliacao("");
        setConduta("");
        setPacienteId("");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível registrar.");
      }
    });
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
      <Card className="p-5 lg:col-span-2">
        <h2 className="text-lg font-semibold text-ink">Nova evolução</h2>
        <div className="mt-4 flex flex-col gap-4">
          <PacienteSelect
            pacientes={pacientes}
            value={pacienteId}
            onChange={setPacienteId}
          />
          <Input
            label="COREN"
            placeholder="COREN/SP 000000"
            value={coren}
            onChange={(e) => setCoren(e.target.value)}
          />
          <Bloco
            id="evol-avaliacao"
            label="Avaliação"
            value={avaliacao}
            onChange={setAvaliacao}
            required
          />
          <Bloco
            id="evol-reavaliacao"
            label="Reavaliação"
            value={reavaliacao}
            onChange={setReavaliacao}
          />
          <Bloco
            id="evol-conduta"
            label="Conduta"
            value={conduta}
            onChange={setConduta}
            required
          />
          <Button onClick={handleSalvar} disabled={pending} className="self-start">
            <Activity className="h-4 w-4" />
            Registrar evolução
          </Button>
        </div>
      </Card>

      <div className="flex flex-col gap-3 lg:col-span-3">
        <h2 className="text-lg font-semibold text-ink">Histórico</h2>
        {evolucoes.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-7 w-7" />}
            title="Nenhuma evolução registrada"
          />
        ) : (
          <Stagger className="flex flex-col gap-3">
            {evolucoes.map((e) => (
              <FadeInUp key={e.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-ink">{e.paciente}</h3>
                    <span className="flex items-center gap-1.5 text-sm text-muted">
                      <Clock className="h-4 w-4" /> {e.data}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 text-sm">
                    <div>
                      <span className="font-medium text-ink">Avaliação: </span>
                      <span className="text-muted">{e.avaliacao}</span>
                    </div>
                    <div>
                      <span className="font-medium text-ink">Reavaliação: </span>
                      <span className="text-muted">{e.reavaliacao}</span>
                    </div>
                    <div>
                      <span className="font-medium text-ink">Conduta: </span>
                      <span className="text-muted">{e.conduta}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                    <span className="flex items-center gap-1.5">
                      <User className="h-4 w-4" /> {e.profissional}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <BadgeCheck className="h-4 w-4" /> {e.coren}
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
