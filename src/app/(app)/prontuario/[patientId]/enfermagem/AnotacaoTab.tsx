"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen, User, Clock, Hash } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { cn } from "@/lib/utils";
import { DocumentActions } from "@/components/clinico/DocumentActions";
import { CancelarDocumentoModal } from "@/components/clinico/CancelarDocumentoModal";
import {
  type AnotacaoEnfermagem,
  type OpcaoPaciente,
} from "@/lib/data/enfermagem";
import { registrarAnotacao, editarAnotacao } from "@/lib/actions/enfermagem";
import { cancelarDocumento } from "@/lib/actions/documento-cancelamento";
import {
  EmptyState,
  PacienteSelect,
  DetalheModal,
  imprimirDocumento,
  type DocCabecalho,
} from "./Shared";

export function AnotacaoTab({
  cabecalho,
  anotacoes,
  pacientes,
  proximoCodigo,
}: {
  cabecalho: DocCabecalho;
  anotacoes: AnotacaoEnfermagem[];
  pacientes: OpcaoPaciente[];
  proximoCodigo: string;
}) {
  const [pacienteId, setPacienteId] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const [viewing, setViewing] = useState<AnotacaoEnfermagem | null>(null);
  const [editing, setEditing] = useState<AnotacaoEnfermagem | null>(null);
  const [editConteudo, setEditConteudo] = useState("");
  const [cancelando, setCancelando] = useState<AnotacaoEnfermagem | null>(null);

  function abrirEdicao(a: AnotacaoEnfermagem) {
    setEditConteudo(a.conteudo);
    setEditing(a);
  }

  function salvarEdicao() {
    if (!editing) return;
    if (!editConteudo.trim()) {
      toast.error("Escreva a anotação.");
      return;
    }
    startTransition(async () => {
      const res = await editarAnotacao({
        id: editing.id,
        content: editConteudo,
      });
      if (res?.ok) {
        toast.success("Anotação atualizada.");
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
        tabela: "nursing_notes",
        id: cancelando.id,
        motivo,
      });
      if (res?.ok) {
        toast.success("Anotação cancelada.");
        setCancelando(null);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível cancelar.");
      }
    });
  }

  function handleSalvar() {
    if (!pacienteId) {
      toast.error("Selecione o paciente.");
      return;
    }
    if (!conteudo.trim()) {
      toast.error("Escreva a anotação.");
      return;
    }
    startTransition(async () => {
      const res = await registrarAnotacao({
        patient_id: pacienteId,
        code: proximoCodigo,
        content: conteudo,
      });
      if (res?.ok) {
        toast.success(`Anotação ${proximoCodigo} registrada.`);
        setConteudo("");
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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Nova anotação</h2>
          <Badge status="active">
            <Hash className="h-3 w-3" />
            {proximoCodigo}
          </Badge>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          <PacienteSelect
            pacientes={pacientes}
            value={pacienteId}
            onChange={setPacienteId}
          />
          <label htmlFor="anotacao-texto" className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Anotação
            </span>
            <textarea
              id="anotacao-texto"
              rows={6}
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              placeholder="Descreva a evolução, intercorrências e cuidados prestados..."
              className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <Button onClick={handleSalvar} disabled={pending} className="self-start">
            <NotebookPen className="h-4 w-4" />
            Registrar anotação
          </Button>
        </div>
      </Card>

      <div className="flex flex-col gap-3 lg:col-span-3">
        <h2 className="text-lg font-semibold text-ink">Histórico</h2>
        {anotacoes.length === 0 ? (
          <EmptyState
            icon={<NotebookPen className="h-7 w-7" />}
            title="Nenhuma anotação registrada"
          />
        ) : (
          <Stagger className="flex flex-col gap-3">
            {anotacoes.map((a) => (
              <FadeInUp key={a.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge status="active">{a.codigo}</Badge>
                      <h3 className="font-semibold text-ink">{a.paciente}</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5 text-sm text-muted">
                        <Clock className="h-4 w-4" /> {a.data}
                      </span>
                      <DocumentActions
                        cancelled={a.cancelledAt != null}
                        cancelReason={a.cancelReason}
                        pending={pending}
                        onView={() => setViewing(a)}
                        onEdit={() => abrirEdicao(a)}
                        onPrint={() =>
                          imprimirDocumento(cabecalho, `Anotação de enfermagem ${a.codigo}`, [
                            { label: "Paciente", value: a.paciente },
                            { label: "Profissional", value: a.profissional },
                            { label: "Data", value: a.data },
                            { label: "Anotação", value: a.conteudo },
                          ])
                        }
                        onCancel={() => setCancelando(a)}
                      />
                    </div>
                  </div>
                  <div
                    className={cn(
                      a.cancelledAt != null &&
                        "text-status-danger [&_*]:text-status-danger",
                    )}
                  >
                    <p className="mt-2 text-sm text-ink">{a.conteudo}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                      <User className="h-4 w-4" /> {a.profissional}
                    </p>
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
        titulo={`Anotação ${viewing?.codigo ?? ""}`}
        campos={
          viewing
            ? [
                { label: "Paciente", value: viewing.paciente },
                { label: "Profissional", value: viewing.profissional },
                { label: "Data", value: viewing.data },
                { label: "Anotação", value: viewing.conteudo },
              ]
            : []
        }
      />

      <Modal
        open={editing != null}
        onClose={() => setEditing(null)}
        title="Editar anotação"
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
        <label htmlFor="editar-anotacao" className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Anotação
          </span>
          <textarea
            id="editar-anotacao"
            rows={6}
            value={editConteudo}
            onChange={(e) => setEditConteudo(e.target.value)}
            className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </Modal>

      <CancelarDocumentoModal
        open={cancelando != null}
        onClose={() => setCancelando(null)}
        onConfirm={confirmarCancelamento}
        pending={pending}
        titulo="Cancelar anotação"
      />
    </div>
  );
}
