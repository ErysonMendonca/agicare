"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  GripVertical,
  AlertTriangle,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { upsertAnamneseTemplate } from "@/lib/actions/anamnese-templates";
import {
  fallbackTemplate,
  type AnamneseField,
  type AnamneseFieldTipo,
  type AnamneseTemplate,
} from "@/lib/data/anamnese-templates.shared";

const TIPOS: { value: AnamneseFieldTipo; label: string }[] = [
  { value: "texto", label: "Texto curto" },
  { value: "textarea", label: "Texto longo" },
  { value: "checkboxes", label: "Múltipla escolha" },
  { value: "select", label: "Lista (seleção única)" },
  { value: "sim_nao", label: "Sim / Não" },
];

/** Gera um id estável para um novo campo (slug do rótulo + sufixo único). */
function novoId(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return `${slug || "campo"}_${Math.random().toString(36).slice(2, 6)}`;
}

const usaOpcoes = (t: AnamneseFieldTipo) => t === "checkboxes" || t === "select";

/**
 * Lousa do gestor: edita o template de anamnese por especialidade.
 * Salva via Server Action (gate `isGestor` no servidor). Os tipos vêm do
 * `.shared` (client-safe). "Restaurar padrão" usa o fallback do motor hardcoded.
 */
export function AnamneseBuilder({ templates }: { templates: AnamneseTemplate[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const especialidades = useMemo(
    () => templates.map((t) => t.specialty),
    [templates],
  );
  const baseMap = useMemo(() => {
    const m = new Map<string, AnamneseField[]>();
    for (const t of templates) m.set(t.specialty, t.fields);
    return m;
  }, [templates]);

  const [specialty, setSpecialty] = useState<string>(
    especialidades[0] ?? "Geral",
  );
  const [fields, setFields] = useState<AnamneseField[]>(
    () => structuredClone(baseMap.get(specialty) ?? []),
  );

  function trocarEspecialidade(s: string) {
    setSpecialty(s);
    setFields(structuredClone(baseMap.get(s) ?? []));
  }

  function patch(i: number, p: Partial<AnamneseField>) {
    setFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...p } : f)));
  }

  function trocarTipo(i: number, tipo: AnamneseFieldTipo) {
    setFields((fs) =>
      fs.map((f, idx) => {
        if (idx !== i) return f;
        const next: AnamneseField = { ...f, tipo };
        if (!usaOpcoes(tipo)) delete next.options;
        else if (!next.options) next.options = [];
        if (tipo !== "texto") delete next.destaque;
        if (tipo !== "sim_nao") delete next.alertaSim;
        return next;
      }),
    );
  }

  function adicionar() {
    const ultima = fields[fields.length - 1]?.section ?? "";
    setFields((fs) => [
      ...fs,
      { id: novoId("campo"), tipo: "texto", label: "", section: ultima },
    ]);
  }

  function remover(i: number) {
    setFields((fs) => fs.filter((_, idx) => idx !== i));
  }

  function mover(i: number, dir: -1 | 1) {
    setFields((fs) => {
      const j = i + dir;
      if (j < 0 || j >= fs.length) return fs;
      const copy = [...fs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  function restaurarPadrao() {
    setFields(fallbackTemplate(specialty).fields);
    toast.info("Padrão restaurado (não esqueça de salvar).");
  }

  function salvar() {
    // Higieniza: garante id (a partir do label se vazio) e remove options vazias.
    const limpos: AnamneseField[] = fields.map((f) => {
      const id = f.id.trim() || novoId(f.label);
      const out: AnamneseField = { ...f, id, label: f.label.trim() };
      if (usaOpcoes(f.tipo)) {
        out.options = (f.options ?? [])
          .map((o) => o.trim())
          .filter(Boolean);
      }
      if (out.section) out.section = out.section.trim();
      return out;
    });

    if (limpos.some((f) => !f.label)) {
      toast.error("Todos os campos precisam de rótulo.");
      return;
    }
    if (limpos.some((f) => usaOpcoes(f.tipo) && !(f.options?.length))) {
      toast.error("Campos de múltipla escolha/lista precisam de opções.");
      return;
    }

    startTransition(async () => {
      const res = await upsertAnamneseTemplate(specialty, limpos);
      if (res?.ok) {
        toast.success("Template de anamnese salvo.");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível salvar o template.");
      }
    });
  }

  return (
    <Card className="max-w-3xl">
      <CardBody>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-ink">Modelos de Anamnese</h3>
            <p className="text-xs text-muted">
              Personalize os campos da anamnese por especialidade
            </p>
          </div>
        </div>

        <div className="mb-5 max-w-xs">
          <Select
            id="anamnese-especialidade"
            label="Especialidade"
            value={specialty}
            onChange={(e) => trocarEspecialidade(e.target.value)}
          >
            {especialidades.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-3">
          {fields.length === 0 && (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              Nenhum campo. Adicione o primeiro abaixo.
            </p>
          )}

          {fields.map((f, i) => (
            <div
              key={f.id}
              className="rounded-xl border border-line bg-surface p-4"
            >
              <div className="mb-3 flex items-start gap-2">
                <div className="flex flex-col pt-1 text-muted">
                  <button
                    type="button"
                    aria-label="Mover para cima"
                    onClick={() => mover(i, -1)}
                    className="hover:text-ink disabled:opacity-30"
                    disabled={i === 0}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    id={`label-${f.id}`}
                    label="Rótulo"
                    value={f.label}
                    onChange={(e) => patch(i, { label: e.target.value })}
                    placeholder="Ex.: Queixa principal"
                  />
                  <Select
                    id={`tipo-${f.id}`}
                    label="Tipo"
                    value={f.tipo}
                    onChange={(e) =>
                      trocarTipo(i, e.target.value as AnamneseFieldTipo)
                    }
                  >
                    {TIPOS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    id={`section-${f.id}`}
                    label="Seção (agrupamento)"
                    value={f.section ?? ""}
                    onChange={(e) => patch(i, { section: e.target.value })}
                    placeholder="Ex.: Histórico Geral de Saúde"
                  />
                  {(f.tipo === "texto" || f.tipo === "textarea") && (
                    <Input
                      id={`ph-${f.id}`}
                      label="Placeholder (opcional)"
                      value={f.placeholder ?? ""}
                      onChange={(e) => patch(i, { placeholder: e.target.value })}
                    />
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Remover campo"
                  onClick={() => remover(i)}
                  className="mt-7 rounded-lg p-2 text-muted hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {usaOpcoes(f.tipo) && (
                <div className="ml-6">
                  <label
                    htmlFor={`opts-${f.id}`}
                    className="mb-1.5 block text-sm font-medium text-ink"
                  >
                    Opções (uma por linha)
                  </label>
                  <textarea
                    id={`opts-${f.id}`}
                    rows={3}
                    value={(f.options ?? []).join("\n")}
                    onChange={(e) =>
                      patch(i, { options: e.target.value.split("\n") })
                    }
                    placeholder={"Opção 1\nOpção 2"}
                    className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                </div>
              )}

              {f.tipo === "texto" && (
                <label className="ml-6 mt-1 flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={f.destaque === "amarelo"}
                    onChange={(e) =>
                      patch(i, {
                        destaque: e.target.checked ? "amarelo" : undefined,
                      })
                    }
                    className="h-4 w-4 accent-brand-500"
                  />
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Destaque (campo de atenção, ex.: alergias)
                </label>
              )}

              {f.tipo === "sim_nao" && (
                <label className="ml-6 mt-1 flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={f.alertaSim === "vermelho"}
                    onChange={(e) =>
                      patch(i, {
                        alertaSim: e.target.checked ? "vermelho" : undefined,
                      })
                    }
                    className="h-4 w-4 accent-brand-500"
                  />
                  <TriangleAlert className="h-4 w-4 text-red-500" />
                  Disparar alerta quando &quot;Sim&quot;
                </label>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4">
          <Button type="button" variant="outline" onClick={adicionar}>
            <Plus className="h-4 w-4" /> Adicionar campo
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={restaurarPadrao}>
            <RotateCcw className="h-4 w-4" /> Restaurar padrão
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={salvar}
            disabled={pending}
          >
            <Save className="h-4 w-4" />
            {pending ? "Salvando..." : "Salvar template"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
