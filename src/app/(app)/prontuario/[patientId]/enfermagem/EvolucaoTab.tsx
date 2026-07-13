"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Activity, User, Clock, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { cn } from "@/lib/utils";
import { DocumentActions } from "@/components/clinico/DocumentActions";
import { CancelarDocumentoModal } from "@/components/clinico/CancelarDocumentoModal";
import {
  type EvolucaoEnfermagem,
  type OpcaoPaciente,
} from "@/lib/data/enfermagem";
import { registrarEvolucao, editarEvolucao } from "@/lib/actions/enfermagem";
import { cancelarDocumento } from "@/lib/actions/documento-cancelamento";
import {
  EmptyState,
  PacienteSelect,
  DetalheModal,
  imprimirDocumento,
  type DocCabecalho,
} from "./Shared";

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
  cabecalho,
  evolucoes,
  pacientes,
}: {
  cabecalho: DocCabecalho;
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

  const [viewing, setViewing] = useState<EvolucaoEnfermagem | null>(null);
  const [editing, setEditing] = useState<EvolucaoEnfermagem | null>(null);
  const [ed, setEd] = useState({
    coren: "",
    assessment: "",
    reassessment: "",
    conduct: "",
  });
  const [cancelando, setCancelando] = useState<EvolucaoEnfermagem | null>(null);

  function abrirEdicao(e: EvolucaoEnfermagem) {
    setEd({
      coren: e.coren === "—" ? "" : e.coren,
      assessment: e.avaliacao === "—" ? "" : e.avaliacao,
      reassessment: e.reavaliacao === "—" ? "" : e.reavaliacao,
      conduct: e.conduta === "—" ? "" : e.conduta,
    });
    setEditing(e);
  }

  function salvarEdicao() {
    if (!editing) return;
    if (!ed.assessment.trim() || !ed.conduct.trim()) {
      toast.error("Preencha a avaliação e a conduta.");
      return;
    }
    startTransition(async () => {
      const res = await editarEvolucao({ id: editing.id, ...ed });
      if (res?.ok) {
        toast.success("Evolução atualizada.");
        setEditing(null);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível atualizar.");
      }
    });
  }

  function confirmarCancelamento(motivo: string) {
    if (!cancelando) return;
    startTransition(async () => {
      const res = await cancelarDocumento({
        tabela: "nursing_evolutions",
        id: cancelando.id,
        motivo,
      });
      if (res?.ok) {
        toast.success("Evolução cancelada.");
        setCancelando(null);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível cancelar.");
      }
    });
  }

  function camposEvolucao(e: EvolucaoEnfermagem) {
    return [
      { label: "Paciente", value: e.paciente },
      { label: "Profissional", value: e.profissional },
      { label: "COREN", value: e.coren },
      { label: "Data", value: e.data },
      { label: "Avaliação", value: e.avaliacao },
      { label: "Reavaliação", value: e.reavaliacao },
      { label: "Conduta", value: e.conduta },
    ];
  }

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
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5 text-sm text-muted">
                        <Clock className="h-4 w-4" /> {e.data}
                      </span>
                      <DocumentActions
                        cancelled={e.cancelledAt != null}
                        cancelReason={e.cancelReason}
                        pending={pending}
                        onView={() => setViewing(e)}
                        onEdit={() => abrirEdicao(e)}
                        onPrint={() =>
                          imprimirDocumento(
                            cabecalho,
                            "Evolução de enfermagem",
                            camposEvolucao(e),
                          )
                        }
                        onCancel={() => setCancelando(e)}
                      />
                    </div>
                  </div>
                  <div
                    className={cn(
                      "mt-3 flex flex-col gap-2 text-sm",
                      e.cancelledAt != null &&
                        "text-status-danger [&_*]:text-status-danger",
                    )}
                  >
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

      <DetalheModal
        open={viewing != null}
        onClose={() => setViewing(null)}
        titulo="Evolução de enfermagem"
        campos={viewing ? camposEvolucao(viewing) : []}
      />

      <Modal
        open={editing != null}
        onClose={() => setEditing(null)}
        title="Editar evolução"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarEdicao} disabled={pending}>
              {pending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="COREN"
            value={ed.coren}
            onChange={(e) => setEd((s) => ({ ...s, coren: e.target.value }))}
          />
          <Bloco
            id="edit-evol-avaliacao"
            label="Avaliação"
            value={ed.assessment}
            onChange={(v) => setEd((s) => ({ ...s, assessment: v }))}
            required
          />
          <Bloco
            id="edit-evol-reavaliacao"
            label="Reavaliação"
            value={ed.reassessment}
            onChange={(v) => setEd((s) => ({ ...s, reassessment: v }))}
          />
          <Bloco
            id="edit-evol-conduta"
            label="Conduta"
            value={ed.conduct}
            onChange={(v) => setEd((s) => ({ ...s, conduct: v }))}
            required
          />
        </div>
      </Modal>

      <CancelarDocumentoModal
        open={cancelando != null}
        onClose={() => setCancelando(null)}
        onConfirm={confirmarCancelamento}
        pending={pending}
        titulo="Cancelar evolução"
      />
    </div>
  );
}
