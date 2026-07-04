"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, X, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/lib/store/confirm";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { AttendanceOptionsByCategory } from "@/lib/data/attendance-options.shared";
import {
  addAttendanceOption,
  updateAttendanceOption,
  removeAttendanceOption,
} from "@/lib/actions/attendance-options";

/** Categoria fixa deste catálogo (reaproveita attendance_options). */
const CATEGORIA = "especialidade";

/**
 * Tela dedicada de "Especialidades": lista, adiciona, edita e remove as
 * especialidades disponíveis para os profissionais. Reaproveita 100% a infra de
 * `attendance_options` (categoria fixa `especialidade`, RLS por clínica), a mesma
 * lista consumida pelo cadastro de profissional e pela ficha de atendimento.
 */
export function EspecialidadesConfig({
  options,
}: {
  options: AttendanceOptionsByCategory;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  // Formulário de adição.
  const [novoLabel, setNovoLabel] = useState("");

  // Edição inline.
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const lista = options[CATEGORIA] ?? [];

  function refresh() {
    router.refresh();
  }

  function adicionar() {
    const label = novoLabel.trim();
    if (!label) {
      toast.error("Informe o nome da especialidade.");
      return;
    }
    startTransition(async () => {
      const res = await addAttendanceOption({ category: CATEGORIA, label, value: label });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Especialidade adicionada.");
      setNovoLabel("");
      refresh();
    });
  }

  function iniciarEdicao(id: string, label: string) {
    setEditId(id);
    setEditLabel(label);
  }

  function salvarEdicao() {
    if (!editId) return;
    const label = editLabel.trim();
    if (!label) {
      toast.error("O nome da especialidade é obrigatório.");
      return;
    }
    startTransition(async () => {
      const res = await updateAttendanceOption(editId, { label, value: label });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Especialidade atualizada.");
      setEditId(null);
      refresh();
    });
  }

  async function remover(id: string, label: string) {
    if (!(await confirm({ message: `Remover a especialidade "${label}"? Esta ação não pode ser desfeita.`, danger: true, confirmLabel: "Remover" }))) return;
    startTransition(async () => {
      const res = await removeAttendanceOption(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Especialidade removida.");
      refresh();
    });
  }

  return (
    <Card className="max-w-3xl">
      <CardBody>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-ink">Especialidades</h3>
            <p className="text-xs text-muted">
              Cadastre as especialidades disponíveis para os profissionais
            </p>
          </div>
        </div>

        {/* Lista das especialidades */}
        <div className="space-y-2">
          {lista.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              Nenhuma especialidade cadastrada.
            </p>
          ) : (
            lista.map((opt) => {
              const emEdicao = editId === opt.id;
              return (
                <div
                  key={opt.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3"
                >
                  {emEdicao ? (
                    <>
                      <Input
                        aria-label="Nome da especialidade"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="min-w-0 flex-1"
                        placeholder="Nome da especialidade"
                      />
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={salvarEdicao}
                        disabled={pending}
                        aria-label="Salvar edição"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditId(null)}
                        disabled={pending}
                        aria-label="Cancelar edição"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink">
                          {opt.label}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => iniciarEdicao(opt.id, opt.label)}
                        disabled={pending}
                        aria-label={`Editar ${opt.label}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remover(opt.id, opt.label)}
                        disabled={pending}
                        aria-label={`Remover ${opt.label}`}
                      >
                        <Trash2 className="h-4 w-4 text-status-danger" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Adicionar nova especialidade */}
        <div className="mt-5 rounded-xl border border-line bg-muted-surface p-4">
          <h4 className="mb-3 text-sm font-semibold text-ink">Adicionar especialidade</h4>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input
              id="nova-especialidade"
              label="Nome"
              value={novoLabel}
              onChange={(e) => setNovoLabel(e.target.value)}
              placeholder="Ex.: Cardiologia"
              className="flex-1"
            />
            <Button
              type="button"
              variant="primary"
              onClick={adicionar}
              disabled={pending}
            >
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
