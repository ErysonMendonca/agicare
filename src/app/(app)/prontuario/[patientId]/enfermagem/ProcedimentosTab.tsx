"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Syringe, Search, Plus, User, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { cn } from "@/lib/utils";
import { DocumentActions } from "@/components/clinico/DocumentActions";
import { CancelarDocumentoModal } from "@/components/clinico/CancelarDocumentoModal";
import {
  type ProcedimentoEnfermagem,
  type OpcaoPaciente,
} from "@/lib/data/enfermagem";
import {
  registrarProcedimento,
  editarProcedimento,
} from "@/lib/actions/enfermagem";
import { cancelarDocumento } from "@/lib/actions/documento-cancelamento";
import {
  EmptyState,
  PacienteSelect,
  DetalheModal,
  imprimirDocumento,
  type DocCabecalho,
} from "./Shared";

export function ProcedimentosTab({
  cabecalho,
  procedimentos,
  pacientes,
}: {
  cabecalho: DocCabecalho;
  procedimentos: ProcedimentoEnfermagem[];
  pacientes: OpcaoPaciente[];
}) {
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const [viewing, setViewing] = useState<ProcedimentoEnfermagem | null>(null);
  const [editing, setEditing] = useState<ProcedimentoEnfermagem | null>(null);
  const [cancelando, setCancelando] =
    useState<ProcedimentoEnfermagem | null>(null);

  function confirmarCancelamento(motivo: string) {
    if (!cancelando) return;
    startTransition(async () => {
      const res = await cancelarDocumento({
        tabela: "nursing_procedures",
        id: cancelando.id,
        motivo,
      });
      if (res?.ok) {
        toast.success("Procedimento cancelado.");
        setCancelando(null);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível cancelar.");
      }
    });
  }

  function camposProc(p: ProcedimentoEnfermagem) {
    return [
      { label: "Procedimento", value: p.nome },
      { label: "Código TUSS", value: p.tuss },
      { label: "Paciente", value: p.paciente },
      { label: "Materiais", value: p.materiais },
      { label: "Local", value: p.local },
      { label: "Profissional", value: p.profissional },
      { label: "Data", value: p.data },
    ];
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return procedimentos;
    return procedimentos.filter((p) =>
      [p.tuss, p.nome, p.materiais, p.local, p.profissional, p.paciente]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [busca, procedimentos]);

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por TUSS, materiais, local ou profissional..."
            className="pl-9"
          />
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Registrar procedimento
        </Button>
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          icon={<Syringe className="h-7 w-7" />}
          title="Nenhum procedimento encontrado"
          subtitle="Ajuste a busca ou registre um novo procedimento de enfermagem."
        />
      ) : (
        <Stagger className="flex flex-col gap-3">
          {filtrados.map((p) => (
            <FadeInUp key={p.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge status="active">TUSS {p.tuss}</Badge>
                    <h3 className="font-semibold text-ink">{p.nome}</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-sm text-muted">
                      <Clock className="h-4 w-4" /> {p.data}
                    </span>
                    <DocumentActions
                      cancelled={p.cancelledAt != null}
                      cancelReason={p.cancelReason}
                      pending={pending}
                      onView={() => setViewing(p)}
                      onEdit={() => setEditing(p)}
                      onPrint={() =>
                        imprimirDocumento(
                          cabecalho,
                          "Procedimento de enfermagem",
                          camposProc(p),
                        )
                      }
                      onCancel={() => setCancelando(p)}
                    />
                  </div>
                </div>
                <div
                  className={cn(
                    p.cancelledAt != null &&
                      "text-status-danger [&_*]:text-status-danger",
                  )}
                >
                <p className="mt-2 text-sm text-muted">
                  <span className="font-medium text-ink">Materiais: </span>
                  {p.materiais}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                  <span className="flex items-center gap-1.5">
                    <User className="h-4 w-4" /> {p.paciente}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" /> {p.local}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Syringe className="h-4 w-4" /> {p.profissional}
                  </span>
                </div>
                </div>
              </Card>
            </FadeInUp>
          ))}
        </Stagger>
      )}

      <ProcedimentoModal
        open={open}
        onClose={() => setOpen(false)}
        pacientes={pacientes}
      />

      <ProcedimentoModal
        open={editing != null}
        onClose={() => setEditing(null)}
        pacientes={pacientes}
        procedimento={editing}
      />

      <DetalheModal
        open={viewing != null}
        onClose={() => setViewing(null)}
        titulo="Procedimento de enfermagem"
        campos={viewing ? camposProc(viewing) : []}
      />

      <CancelarDocumentoModal
        open={cancelando != null}
        onClose={() => setCancelando(null)}
        onConfirm={confirmarCancelamento}
        pending={pending}
        titulo="Cancelar procedimento"
      />
    </div>
  );
}

function ProcedimentoModal({
  open,
  onClose,
  pacientes,
  procedimento = null,
}: {
  open: boolean;
  onClose: () => void;
  pacientes: OpcaoPaciente[];
  /** Quando presente, o modal edita este registro em vez de criar um novo. */
  procedimento?: ProcedimentoEnfermagem | null;
}) {
  const modoEdicao = procedimento != null;
  const [pacienteId, setPacienteId] = useState("");
  const [form, setForm] = useState({
    tuss_code: "",
    name: "",
    materials: "",
    body_site: "",
    notes: "",
  });
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Pré-carrega os campos ao abrir em modo edição.
  useEffect(() => {
    if (open && procedimento) {
      const limpa = (v: string) => (v === "—" ? "" : v);
      setForm({
        tuss_code: limpa(procedimento.tuss),
        name: limpa(procedimento.nome),
        materials: limpa(procedimento.materiais),
        body_site: limpa(procedimento.local),
        notes: "",
      });
    }
  }, [open, procedimento]);

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSalvar() {
    if (!modoEdicao && !pacienteId) {
      toast.error("Selecione o paciente.");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Informe o procedimento.");
      return;
    }
    startTransition(async () => {
      const res = modoEdicao
        ? await editarProcedimento({ id: procedimento.id, ...form })
        : await registrarProcedimento({ patient_id: pacienteId, ...form });
      if (res?.ok) {
        toast.success(
          modoEdicao ? "Procedimento atualizado." : "Procedimento registrado.",
        );
        setPacienteId("");
        setForm({ tuss_code: "", name: "", materials: "", body_site: "", notes: "" });
        router.refresh();
        onClose();
      } else {
        toast.error(res?.error ?? "Não foi possível salvar.");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        modoEdicao
          ? "Editar procedimento de enfermagem"
          : "Registrar procedimento de enfermagem"
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={pending}>
            {modoEdicao ? "Salvar alterações" : "Registrar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!modoEdicao && (
          <PacienteSelect
            pacientes={pacientes}
            value={pacienteId}
            onChange={setPacienteId}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Código TUSS"
            value={form.tuss_code}
            onChange={(e) => set("tuss_code", e.target.value)}
          />
          <Input
            label="Local do corpo"
            value={form.body_site}
            onChange={(e) => set("body_site", e.target.value)}
          />
        </div>
        <Input
          label="Procedimento"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />
        <label htmlFor="proc-materiais" className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Materiais
          </span>
          <textarea
            id="proc-materiais"
            rows={2}
            value={form.materials}
            onChange={(e) => set("materials", e.target.value)}
            className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <label htmlFor="proc-notes" className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Observações
          </span>
          <textarea
            id="proc-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </div>
    </Modal>
  );
}
