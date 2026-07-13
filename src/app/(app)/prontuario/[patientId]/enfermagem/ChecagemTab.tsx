"use client";

import { useState, useTransition } from "react";
import { ClipboardCheck, Clock, User, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { cn } from "@/lib/utils";
import { DocumentActions } from "@/components/clinico/DocumentActions";
import { CancelarDocumentoModal } from "@/components/clinico/CancelarDocumentoModal";
import { type Cuidado } from "@/lib/data/enfermagem";
import { checarCuidado, reaprazarCuidado } from "@/lib/actions/enfermagem";
import { cancelarDocumento } from "@/lib/actions/documento-cancelamento";
import { EmptyState, DetalheModal, imprimirDocumento } from "./Shared";

function camposCuidado(c: Cuidado) {
  return [
    { label: "Cuidado", value: c.descricao },
    { label: "Paciente", value: c.paciente },
    { label: "Horário", value: c.horario },
    { label: "Status", value: c.status.label },
    { label: "Justificativa", value: c.justificativa },
    { label: "Profissional", value: c.profissional },
  ];
}

export function ChecagemTab({ cuidados }: { cuidados: Cuidado[] }) {
  const [selecionado, setSelecionado] = useState<Cuidado | null>(null);
  const [viewing, setViewing] = useState<Cuidado | null>(null);
  const [cancelando, setCancelando] = useState<Cuidado | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function confirmarCancelamento(motivo: string) {
    if (!cancelando) return;
    startTransition(async () => {
      const res = await cancelarDocumento({
        tabela: "care_checks",
        id: cancelando.id,
        motivo,
      });
      if (res?.ok) {
        toast.success("Cuidado cancelado.");
        setCancelando(null);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível cancelar.");
      }
    });
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-ink">Cuidados aprazados</h2>

      {cuidados.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-7 w-7" />}
          title="Nenhum cuidado aprazado"
          subtitle="Os horários gerados pela SAE aparecem aqui para checagem."
        />
      ) : (
        <Stagger className="flex flex-col gap-3">
          {cuidados.map((c) => {
            const cancelado = c.cancelledAt != null;
            return (
              <FadeInUp key={c.id}>
                <Card
                  interactive={!cancelado}
                  role={cancelado ? undefined : "button"}
                  tabIndex={cancelado ? undefined : 0}
                  onClick={cancelado ? undefined : () => setSelecionado(c)}
                  onKeyDown={
                    cancelado
                      ? undefined
                      : (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelecionado(c);
                          }
                        }
                  }
                  className={cancelado ? "p-4" : "cursor-pointer p-4"}
                >
                  <div className="flex items-center gap-4">
                    <span className="flex h-12 w-16 flex-none flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Clock className="h-4 w-4" />
                      <span className="text-xs font-bold">{c.horario}</span>
                    </span>
                    <div
                      className={cn(
                        "min-w-0 flex-1",
                        cancelado &&
                          "text-status-danger [&_*]:text-status-danger",
                      )}
                    >
                      <h3 className="font-semibold text-ink">{c.descricao}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                        <span className="flex items-center gap-1.5">
                          <User className="h-4 w-4" /> {c.paciente}
                        </span>
                        {c.profissional !== "—" && (
                          <span>Checado por {c.profissional}</span>
                        )}
                      </div>
                      {c.justificativa !== "—" && (
                        <p className="mt-1 text-sm text-orange-600">
                          Justificativa: {c.justificativa}
                        </p>
                      )}
                    </div>
                    {!cancelado && (
                      <Badge status={c.status.tone} className="flex-none">
                        {c.status.label}
                      </Badge>
                    )}
                    <div
                      className="flex-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DocumentActions
                        cancelled={cancelado}
                        cancelReason={c.cancelReason}
                        pending={pending}
                        onView={() => setViewing(c)}
                        onPrint={() =>
                          imprimirDocumento("Checagem de cuidado", camposCuidado(c))
                        }
                        onCancel={() => setCancelando(c)}
                      />
                    </div>
                  </div>
                </Card>
              </FadeInUp>
            );
          })}
        </Stagger>
      )}

      {selecionado && (
        <ChecagemModal
          cuidado={selecionado}
          open={!!selecionado}
          onClose={() => setSelecionado(null)}
        />
      )}

      <DetalheModal
        open={viewing != null}
        onClose={() => setViewing(null)}
        titulo="Checagem de cuidado"
        campos={viewing ? camposCuidado(viewing) : []}
      />

      <CancelarDocumentoModal
        open={cancelando != null}
        onClose={() => setCancelando(null)}
        onConfirm={confirmarCancelamento}
        pending={pending}
        titulo="Cancelar cuidado"
      />
    </div>
  );
}

type Modo = "checar" | "reaprazar";

function ChecagemModal({
  cuidado,
  open,
  onClose,
}: {
  cuidado: Cuidado;
  open: boolean;
  onClose: () => void;
}) {
  const [modo, setModo] = useState<Modo>("checar");
  const [status, setStatus] = useState<"administrado" | "aprazado" | "">("");
  const [justificativa, setJustificativa] = useState("");
  const [novoHorario, setNovoHorario] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function reset() {
    setModo("checar");
    setStatus("");
    setJustificativa("");
    setNovoHorario("");
  }

  function handleChecar() {
    if (status !== "administrado" && status !== "aprazado") {
      toast.error("Informe se foi administrado ou aprazado.");
      return;
    }
    if (status === "aprazado" && !justificativa.trim()) {
      toast.error("Justifique a não checagem.");
      return;
    }
    startTransition(async () => {
      const res = await checarCuidado({
        id: cuidado.id,
        status,
        justification: justificativa,
      });
      if (res?.ok) {
        toast.success("Checagem registrada.");
        reset();
        router.refresh();
        onClose();
      } else {
        toast.error(res?.error ?? "Não foi possível registrar a checagem.");
      }
    });
  }

  function handleReaprazar() {
    if (!novoHorario) {
      toast.error("Informe o novo horário.");
      return;
    }
    startTransition(async () => {
      const res = await reaprazarCuidado({
        id: cuidado.id,
        scheduled_at: novoHorario,
      });
      if (res?.ok) {
        toast.success("Cuidado reaprazado.");
        reset();
        router.refresh();
        onClose();
      } else {
        toast.error(res?.error ?? "Não foi possível reaprazar.");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Checagem de cuidado"
      subtitle={`${cuidado.descricao} — ${cuidado.paciente}`}
      footer={
        modo === "checar" ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={handleChecar} disabled={pending}>
              Confirmar checagem
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              onClick={() => setModo("checar")}
              disabled={pending}
            >
              Voltar
            </Button>
            <Button onClick={handleReaprazar} disabled={pending}>
              <CalendarClock className="h-4 w-4" />
              Confirmar novo horário
            </Button>
          </>
        )
      }
    >
      {modo === "checar" ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-muted-surface p-3 text-sm text-muted">
            <span className="font-medium text-ink">Horário aprazado: </span>
            {cuidado.horario}
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">
              Resultado da checagem <span className="text-red-500">*</span>
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStatus("administrado")}
                className={
                  status === "administrado"
                    ? "rounded-xl border-2 border-green-500 bg-green-50 px-4 py-3 text-sm font-medium text-green-700"
                    : "rounded-xl border border-line bg-white px-4 py-3 text-sm font-medium text-muted hover:text-ink"
                }
              >
                Administrado
              </button>
              <button
                type="button"
                onClick={() => setStatus("aprazado")}
                className={
                  status === "aprazado"
                    ? "rounded-xl border-2 border-orange-500 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-700"
                    : "rounded-xl border border-line bg-white px-4 py-3 text-sm font-medium text-muted hover:text-ink"
                }
              >
                Aprazado (não checado)
              </button>
            </div>
          </fieldset>

          {status === "aprazado" && (
            <label htmlFor="checagem-justificativa" className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Justificativa da não checagem{" "}
                <span className="text-red-500">*</span>
              </span>
              <textarea
                id="checagem-justificativa"
                rows={3}
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                autoFocus
                className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>
          )}

          <button
            type="button"
            onClick={() => setModo("reaprazar")}
            className="self-start text-sm font-medium text-brand-600 hover:underline"
          >
            Reaprazar (alterar horário)
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Defina o novo horário de aprazamento para este cuidado.
          </p>
          <Input
            label="Novo horário"
            type="datetime-local"
            value={novoHorario}
            onChange={(e) => setNovoHorario(e.target.value)}
          />
        </div>
      )}
    </Modal>
  );
}
