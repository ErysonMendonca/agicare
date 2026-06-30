"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { type FilaItem } from "@/lib/data/queue";
import { salvarTriagem } from "@/lib/actions/triagem";
import type { TriageTemplate } from "@/lib/data/triage-templates.shared";

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

/**
 * Triagem de um paciente da fila: campos vêm do TEMPLATE da especialidade
 * (configurável pelo gestor; fallback = triagem fixa atual). Cada campo é
 * renderizado pelo seu `tipo`; o campo `risco` reusa o radiogroup Manchester.
 * Salva via `salvarTriagem` (avança a fila ao concluir) → toast + refresh + fecha.
 */
export function TriagemModal({
  item,
  template,
  open,
  onClose,
  onStatusChange,
}: {
  item: FilaItem;
  template: TriageTemplate;
  open: boolean;
  onClose: () => void;
  onStatusChange?: (statusRaw: string) => void;
}) {
  // Campos não-risco editáveis (numero/texto/textarea/select/sim_nao/checkboxes).
  const campos = useMemo(
    () => template.fields.filter((f) => f.tipo !== "risco"),
    [template],
  );
  const campoRisco = useMemo(
    () => template.fields.find((f) => f.tipo === "risco"),
    [template],
  );

  // Respostas simples (string) + múltipla escolha (string[]).
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [marcados, setMarcados] = useState<Record<string, string[]>>({});
  const [risco, setRisco] = useState<RiskLevel | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function setResp(id: string, value: string) {
    setRespostas((r) => ({ ...r, [id]: value }));
  }

  function toggleCheck(id: string, option: string) {
    setMarcados((m) => {
      const atual = m[id] ?? [];
      const next = atual.includes(option)
        ? atual.filter((o) => o !== option)
        : [...atual, option];
      return { ...m, [id]: next };
    });
  }

  function limpar() {
    setRespostas({});
    setMarcados({});
    setRisco(null);
  }

  function handleSalvar() {
    if (campoRisco && !risco) {
      toast.error("Selecione a classificação de risco.");
      return;
    }

    // Monta o array denormalizado { id, label, value } para campos preenchidos.
    const data: { id: string; label: string; value: string }[] = [];
    for (const f of campos) {
      let value = "";
      if (f.tipo === "checkboxes") {
        value = (marcados[f.id] ?? []).join(", ");
      } else {
        value = (respostas[f.id] ?? "").trim();
      }
      if (value) data.push({ id: f.id, label: f.label, value });
    }

    startTransition(async () => {
      const res = await salvarTriagem({
        queueEntryId: item.id,
        patientId: item.patientId ?? undefined,
        data,
        riskLevel: risco ?? undefined,
      });
      if (res?.ok) {
        toast.success("Triagem registrada. Paciente encaminhado.");
        limpar();
        onStatusChange?.("chamado");
        router.refresh();
        onClose();
      } else {
        toast.error(res?.error ?? "Não foi possível salvar a triagem.");
      }
    });
  }

  // Agrupa os campos por seção, preservando a ordem de 1ª aparição.
  const secoes = useMemo(() => {
    const ordem: string[] = [];
    const map = new Map<string, typeof campos>();
    for (const f of campos) {
      const sec = f.section ?? "";
      if (!map.has(sec)) {
        map.set(sec, []);
        ordem.push(sec);
      }
      map.get(sec)!.push(f);
    }
    return ordem.map((sec) => ({ sec, fields: map.get(sec)! }));
  }, [campos]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Triagem do paciente"
      subtitle={`${item.paciente} · Senha ${item.codigo}${
        item.atendimentoCodigo ? ` · Atendimento ${item.atendimentoCodigo}` : ""
      }`}
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
        {secoes.map(({ sec, fields }) => (
          <div key={sec || "geral"}>
            {sec && (
              <p className="mb-3 text-sm font-semibold text-ink">{sec}</p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {fields.map((f) => {
                const label = f.unidade ? `${f.label} (${f.unidade})` : f.label;
                if (f.tipo === "numero") {
                  return (
                    <Input
                      key={f.id}
                      label={label}
                      type="number"
                      inputMode="decimal"
                      value={respostas[f.id] ?? ""}
                      onChange={(e) => setResp(f.id, e.target.value)}
                    />
                  );
                }
                if (f.tipo === "texto") {
                  return (
                    <Input
                      key={f.id}
                      label={f.label}
                      placeholder={f.placeholder}
                      value={respostas[f.id] ?? ""}
                      onChange={(e) => setResp(f.id, e.target.value)}
                    />
                  );
                }
                if (f.tipo === "select") {
                  return (
                    <Select
                      key={f.id}
                      id={`triagem-${f.id}`}
                      label={f.label}
                      value={respostas[f.id] ?? ""}
                      onChange={(e) => setResp(f.id, e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  );
                }
                if (f.tipo === "sim_nao") {
                  const val = respostas[f.id] ?? "";
                  return (
                    <div key={f.id} className="sm:col-span-2">
                      <span className="mb-1.5 block text-sm font-medium text-ink">
                        {f.label}
                      </span>
                      <div className="flex gap-2">
                        {["Sim", "Não"].map((opt) => {
                          const ativo = val === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setResp(f.id, ativo ? "" : opt)}
                              className={`flex-1 rounded-xl border p-2.5 text-sm font-medium transition-colors ${
                                ativo
                                  ? "border-brand-400 bg-brand-50 text-brand-600"
                                  : "border-line text-muted hover:bg-muted-surface"
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                if (f.tipo === "checkboxes") {
                  const sel = marcados[f.id] ?? [];
                  return (
                    <div key={f.id} className="sm:col-span-2">
                      <span className="mb-1.5 block text-sm font-medium text-ink">
                        {f.label}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {(f.options ?? []).map((o) => (
                          <label
                            key={o}
                            className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
                          >
                            <input
                              type="checkbox"
                              checked={sel.includes(o)}
                              onChange={() => toggleCheck(f.id, o)}
                              className="h-4 w-4 accent-brand-500"
                            />
                            {o}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                }
                // textarea
                return (
                  <label key={f.id} htmlFor={`triagem-${f.id}`} className="block sm:col-span-2">
                    <span className="mb-1.5 block text-sm font-medium text-ink">
                      {f.label}
                    </span>
                    <textarea
                      id={`triagem-${f.id}`}
                      rows={3}
                      placeholder={f.placeholder}
                      value={respostas[f.id] ?? ""}
                      onChange={(e) => setResp(f.id, e.target.value)}
                      className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        {/* Classificação de risco (Manchester) — campo fixo do tipo "risco". */}
        {campoRisco && (
          <div>
            <p className="mb-1 text-sm font-semibold text-ink">
              {campoRisco.label} <span className="text-status-danger">*</span>
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
        )}
      </div>
    </Modal>
  );
}
