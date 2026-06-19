"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HeartPulse, Plus, User, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import {
  type SinalVital,
  type OpcaoPaciente,
} from "@/lib/data/enfermagem";
import {
  registrarAfericao,
  type AfericaoInput,
} from "@/lib/actions/enfermagem";
import { EmptyState, PacienteSelect } from "./Shared";

type Tone = "ok" | "warn" | "danger";

const TILE_TONE: Record<Tone, string> = {
  ok: "bg-green-50 text-green-700",
  warn: "bg-orange-50 text-orange-700",
  danger: "bg-red-50 text-red-700",
};

/** Extrai o primeiro número de um texto tipo "120/80 mmHg" → 120. */
function firstNum(s: string): number {
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

function classify(value: string, min: number, max: number): Tone {
  const n = firstNum(value);
  if (Number.isNaN(n)) return "ok";
  if (n < min || n > max) return "danger";
  return "ok";
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}) {
  return (
    <div className={`rounded-xl p-3 ${TILE_TONE[tone]}`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="mt-0.5 text-sm font-bold">{value}</div>
    </div>
  );
}

export function SinaisVitaisTab({
  sinais,
  pacientes,
}: {
  sinais: SinalVital[];
  pacientes: OpcaoPaciente[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">
          Histórico de aférições
        </h2>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Nova aférição
        </Button>
      </div>

      {sinais.length === 0 ? (
        <EmptyState
          icon={<HeartPulse className="h-7 w-7" />}
          title="Nenhuma aférição registrada"
          subtitle="Registre PA, FC, FR, Tax, SpO2 e HGT para acompanhar o paciente."
        />
      ) : (
        <Stagger className="flex flex-col gap-3">
          {sinais.map((s) => (
            <FadeInUp key={s.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-ink">{s.paciente}</h3>
                  <div className="flex items-center gap-4 text-sm text-muted">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" /> {s.registradoEm}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <User className="h-4 w-4" /> {s.profissional}
                    </span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <Tile label="PA" value={s.pa} tone={classify(s.pa, 90, 139)} />
                  <Tile label="FC" value={s.fc} tone={classify(s.fc, 60, 100)} />
                  <Tile label="FR" value={s.fr} tone={classify(s.fr, 12, 20)} />
                  <Tile
                    label="Tax"
                    value={s.temp}
                    tone={classify(s.temp, 35.5, 37.7)}
                  />
                  <Tile
                    label="SpO2"
                    value={s.spo2}
                    tone={classify(s.spo2, 95, 100)}
                  />
                  <Tile
                    label="HGT"
                    value={s.hgt}
                    tone={classify(s.hgt, 70, 140)}
                  />
                </div>
                {s.extras.length > 0 && (
                  <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    {s.extras.map((x, i) => (
                      <div key={i} className="flex gap-1.5">
                        <dt className="text-muted">{x.label}:</dt>
                        <dd className="font-medium text-ink">{x.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {s.observacoes && s.observacoes !== "—" && (
                  <p className="mt-3 text-sm text-muted">
                    <span className="font-medium text-ink">Observações: </span>
                    {s.observacoes}
                  </p>
                )}
              </Card>
            </FadeInUp>
          ))}
        </Stagger>
      )}

      <AfericaoModal
        open={open}
        onClose={() => setOpen(false)}
        pacientes={pacientes}
      />
    </div>
  );
}

function AfericaoModal({
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
    systolic: "",
    diastolic: "",
    heart_rate: "",
    resp_rate: "",
    temperature: "",
    spo2: "",
    glucose: "",
    notes: "",
  });
  // Sinais pediátricos/neonatais estruturados — gravam no jsonb `vital_signs.extra`
  // (via array `extras`, rótulos fixos). Opcionais: só vão se preenchidos.
  const [ped, setPed] = useState({
    perimetro_cefalico: "",
    perimetro_toracico: "",
    peso: "",
    dor_neonatal: "",
  });
  const [extras, setExtras] = useState<Array<{ label: string; value: string }>>(
    [],
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setPediatrico(field: keyof typeof ped, value: string) {
    setPed((p) => ({ ...p, [field]: value }));
  }

  function handleSalvar() {
    if (!pacienteId) {
      toast.error("Selecione o paciente.");
      return;
    }
    // Campos pediátricos/neonatais preenchidos → extras com rótulo+unidade fixos.
    const pedExtras = [
      { key: "perimetro_cefalico", label: "Perímetro cefálico", unit: "cm" },
      { key: "perimetro_toracico", label: "Perímetro torácico", unit: "cm" },
      { key: "peso", label: "Peso", unit: "g" },
      { key: "dor_neonatal", label: "Escala de dor neonatal (NIPS)", unit: "" },
    ]
      .map(({ key, label, unit }) => {
        const v = ped[key as keyof typeof ped].trim();
        if (!v) return null;
        return { label, value: unit ? `${v} ${unit}` : v };
      })
      .filter((x): x is { label: string; value: string } => x !== null);

    const payload: AfericaoInput = {
      patient_id: pacienteId,
      systolic: form.systolic,
      diastolic: form.diastolic,
      heart_rate: form.heart_rate,
      resp_rate: form.resp_rate,
      temperature: form.temperature,
      spo2: form.spo2,
      glucose: form.glucose,
      notes: form.notes,
      extras: [...pedExtras, ...extras],
    };
    startTransition(async () => {
      const res = await registrarAfericao(payload);
      if (res?.ok) {
        toast.success("Aférição registrada.");
        setPacienteId("");
        setForm({
          systolic: "",
          diastolic: "",
          heart_rate: "",
          resp_rate: "",
          temperature: "",
          spo2: "",
          glucose: "",
          notes: "",
        });
        setExtras([]);
        setPed({
          perimetro_cefalico: "",
          perimetro_toracico: "",
          peso: "",
          dor_neonatal: "",
        });
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
      title="Nova aférição de sinais vitais"
      subtitle="Registre os parâmetros do paciente"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={pending}>
            Salvar aférição
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
            label="PA Sistólica (mmHg)"
            type="number"
            value={form.systolic}
            onChange={(e) => set("systolic", e.target.value)}
          />
          <Input
            label="PA Diastólica (mmHg)"
            type="number"
            value={form.diastolic}
            onChange={(e) => set("diastolic", e.target.value)}
          />
          <Input
            label="FC (bpm)"
            type="number"
            value={form.heart_rate}
            onChange={(e) => set("heart_rate", e.target.value)}
          />
          <Input
            label="FR (irpm)"
            type="number"
            value={form.resp_rate}
            onChange={(e) => set("resp_rate", e.target.value)}
          />
          <Input
            label="Tax (°C)"
            type="number"
            step="0.1"
            value={form.temperature}
            onChange={(e) => set("temperature", e.target.value)}
          />
          <Input
            label="SpO2 (%)"
            type="number"
            value={form.spo2}
            onChange={(e) => set("spo2", e.target.value)}
          />
          <Input
            label="HGT (mg/dL)"
            type="number"
            value={form.glucose}
            onChange={(e) => set("glucose", e.target.value)}
          />
        </div>

        <div className="border-t border-line pt-4">
          <p className="text-sm font-semibold text-ink">
            Pediátrico / Neonatal
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Parâmetros específicos do recém-nascido e da criança (opcional).
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Input
              label="Perímetro cefálico (cm)"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={ped.perimetro_cefalico}
              onChange={(e) =>
                setPediatrico("perimetro_cefalico", e.target.value)
              }
            />
            <Input
              label="Perímetro torácico (cm)"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={ped.perimetro_toracico}
              onChange={(e) =>
                setPediatrico("perimetro_toracico", e.target.value)
              }
            />
            <Input
              label="Peso (g)"
              type="number"
              inputMode="numeric"
              value={ped.peso}
              onChange={(e) => setPediatrico("peso", e.target.value)}
            />
            <Select
              id="vitais-dor-neonatal"
              label="Escala de dor neonatal (NIPS)"
              value={ped.dor_neonatal}
              onChange={(e) => setPediatrico("dor_neonatal", e.target.value)}
            >
              <option value="">Não avaliada</option>
              {Array.from({ length: 8 }, (_, i) => (
                <option key={i} value={String(i)}>
                  {i} {i >= 4 ? "— dor (avaliar conduta)" : ""}
                </option>
              ))}
            </Select>
          </div>
          <p className="mt-2 text-xs text-muted">
            Glicemia capilar do neonato: use o campo <strong>HGT</strong> acima.
          </p>
        </div>

        <div className="border-t border-line pt-4">
          <p className="text-xs font-medium text-muted">
            Outros sinais (opcional)
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Itens extras, ex.: sinais vitais do bebê (perímetro cefálico).
          </p>
          {extras.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {extras.map((item, i) => (
                <div key={i} className="flex items-end gap-2">
                  <Input
                    label={i === 0 ? "Rótulo" : undefined}
                    placeholder="Ex.: Perímetro cefálico"
                    value={item.label}
                    onChange={(e) =>
                      setExtras((arr) =>
                        arr.map((x, j) =>
                          j === i ? { ...x, label: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <Input
                    label={i === 0 ? "Valor" : undefined}
                    placeholder="Ex.: 34 cm"
                    value={item.value}
                    onChange={(e) =>
                      setExtras((arr) =>
                        arr.map((x, j) =>
                          j === i ? { ...x, value: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Remover item"
                    onClick={() =>
                      setExtras((arr) => arr.filter((_, j) => j !== i))
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() =>
              setExtras((arr) => [...arr, { label: "", value: "" }])
            }
          >
            <Plus className="h-4 w-4" /> Adicionar item
          </Button>
        </div>

        <label htmlFor="vitais-obs" className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Observações
          </span>
          <textarea
            id="vitais-obs"
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
