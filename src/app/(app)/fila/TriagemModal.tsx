"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { type FilaItem } from "@/lib/data/queue";
import { salvarTriagem } from "@/lib/actions/triagem";

type RiskLevel = "azul" | "verde" | "amarelo" | "laranja" | "vermelho";

/** Classificação de risco Manchester — selo colorido + descrição. */
const RISCOS: {
  level: RiskLevel;
  label: string;
  desc: string;
  /** Cor sólida do selo (Manchester usa cores fixas, não tokens de marca). */
  dot: string;
  ring: string;
}[] = [
  { level: "vermelho", label: "Vermelho", desc: "Emergência — imediato", dot: "bg-red-600", ring: "ring-red-500" },
  { level: "laranja", label: "Laranja", desc: "Muito urgente — 10 min", dot: "bg-orange-500", ring: "ring-orange-500" },
  { level: "amarelo", label: "Amarelo", desc: "Urgente — 60 min", dot: "bg-yellow-400", ring: "ring-yellow-500" },
  { level: "verde", label: "Verde", desc: "Pouco urgente — 120 min", dot: "bg-green-600", ring: "ring-green-500" },
  { level: "azul", label: "Azul", desc: "Não urgente — 240 min", dot: "bg-blue-600", ring: "ring-blue-500" },
];

const VAZIO = {
  systolic: "",
  diastolic: "",
  heart_rate: "",
  resp_rate: "",
  temperature: "",
  spo2: "",
  weight: "",
  height: "",
  glucose: "",
  notes: "",
};

/**
 * Triagem de um paciente da fila: sinais vitais + classificação de risco
 * (Manchester). Reaproveita o visual do form de sinais vitais da Enfermagem.
 * Salva via `salvarTriagem` (avança a fila ao concluir) → toast + refresh + fecha.
 */
export function TriagemModal({
  item,
  open,
  onClose,
  onStatusChange,
}: {
  item: FilaItem;
  open: boolean;
  onClose: () => void;
  onStatusChange?: (statusRaw: string) => void;
}) {
  const [form, setForm] = useState(VAZIO);
  const [risco, setRisco] = useState<RiskLevel | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSalvar() {
    if (!risco) {
      toast.error("Selecione a classificação de risco.");
      return;
    }
    startTransition(async () => {
      const res = await salvarTriagem({
        queueEntryId: item.id,
        patientId: item.patientId ?? undefined,
        systolic: form.systolic,
        diastolic: form.diastolic,
        heart_rate: form.heart_rate,
        resp_rate: form.resp_rate,
        temperature: form.temperature,
        spo2: form.spo2,
        weight: form.weight,
        height: form.height,
        glucose: form.glucose,
        riskLevel: risco,
        notes: form.notes,
      });
      if (res?.ok) {
        toast.success("Triagem registrada. Paciente encaminhado.");
        setForm(VAZIO);
        setRisco(null);
        onStatusChange?.("chamado");
        router.refresh();
        onClose();
      } else {
        toast.error(res?.error ?? "Não foi possível salvar a triagem.");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Triagem do paciente"
      subtitle={`${item.paciente} · Senha ${item.codigo}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={pending}>
            {pending ? "Salvando..." : "Concluir triagem"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Sinais vitais */}
        <div>
          <p className="mb-3 text-sm font-semibold text-ink">Sinais vitais</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="PA Sistólica (mmHg)" type="number" inputMode="numeric" value={form.systolic} onChange={(e) => set("systolic", e.target.value)} />
            <Input label="PA Diastólica (mmHg)" type="number" inputMode="numeric" value={form.diastolic} onChange={(e) => set("diastolic", e.target.value)} />
            <Input label="FC (bpm)" type="number" inputMode="numeric" value={form.heart_rate} onChange={(e) => set("heart_rate", e.target.value)} />
            <Input label="FR (irpm)" type="number" inputMode="numeric" value={form.resp_rate} onChange={(e) => set("resp_rate", e.target.value)} />
            <Input label="Tax (°C)" type="number" step="0.1" inputMode="decimal" value={form.temperature} onChange={(e) => set("temperature", e.target.value)} />
            <Input label="SpO2 (%)" type="number" inputMode="numeric" value={form.spo2} onChange={(e) => set("spo2", e.target.value)} />
            <Input label="Peso (kg)" type="number" step="0.1" inputMode="decimal" value={form.weight} onChange={(e) => set("weight", e.target.value)} />
            <Input label="Altura (cm)" type="number" step="0.1" inputMode="decimal" value={form.height} onChange={(e) => set("height", e.target.value)} />
            <Input label="HGT (mg/dL)" type="number" inputMode="numeric" value={form.glucose} onChange={(e) => set("glucose", e.target.value)} />
          </div>
        </div>

        {/* Classificação de risco (Manchester) */}
        <div>
          <p className="mb-1 text-sm font-semibold text-ink">
            Classificação de risco <span className="text-status-danger">*</span>
          </p>
          <p className="mb-3 text-xs text-muted">Protocolo de Manchester</p>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Classificação de risco">
            {RISCOS.map((r) => {
              const ativo = risco === r.level;
              return (
                <button
                  key={r.level}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  onClick={() => setRisco(r.level)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                    ativo
                      ? `border-transparent bg-muted-surface ring-2 ${r.ring}`
                      : "border-line hover:bg-muted-surface"
                  }`}
                >
                  <span className={`h-5 w-5 flex-none rounded-full ${r.dot}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{r.label}</span>
                    <span className="block text-xs text-muted">{r.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Observações */}
        <label htmlFor="triagem-obs" className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Observações</span>
          <textarea
            id="triagem-obs"
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </div>
    </Modal>
  );
}
