"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Syringe, Search, Plus, User, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import {
  type ProcedimentoEnfermagem,
  type OpcaoPaciente,
} from "@/lib/data/enfermagem";
import { registrarProcedimento } from "@/lib/actions/enfermagem";
import { EmptyState, PacienteSelect } from "./Shared";

export function ProcedimentosTab({
  procedimentos,
  pacientes,
}: {
  procedimentos: ProcedimentoEnfermagem[];
  pacientes: OpcaoPaciente[];
}) {
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);

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
                  <span className="flex items-center gap-1.5 text-sm text-muted">
                    <Clock className="h-4 w-4" /> {p.data}
                  </span>
                </div>
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
    </div>
  );
}

function ProcedimentoModal({
  open,
  onClose,
  pacientes,
}: {
  open: boolean;
  onClose: () => void;
  pacientes: OpcaoPaciente[];
}) {
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

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSalvar() {
    if (!pacienteId) {
      toast.error("Selecione o paciente.");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Informe o procedimento.");
      return;
    }
    startTransition(async () => {
      const res = await registrarProcedimento({
        patient_id: pacienteId,
        ...form,
      });
      if (res?.ok) {
        toast.success("Procedimento registrado.");
        setPacienteId("");
        setForm({ tuss_code: "", name: "", materials: "", body_site: "", notes: "" });
        router.refresh();
        onClose();
      } else {
        toast.error(res?.error ?? "Não foi possível registrar.");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar procedimento de enfermagem"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={pending}>
            Registrar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PacienteSelect
          pacientes={pacientes}
          value={pacienteId}
          onChange={setPacienteId}
        />
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
