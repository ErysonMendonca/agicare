"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, X, ListTree } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/lib/store/confirm";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { MotivoAlta, DetalheAlta } from "@/lib/data/alta";
import {
  addAttendanceOption,
  updateAttendanceOption,
  removeAttendanceOption,
} from "@/lib/actions/attendance-options";

/** Categoria fixa deste catálogo (reaproveita attendance_options). */
const CATEGORIA = "detalhe_alta";

/**
 * Catálogo de "Detalhes de Alta": cada detalhe pertence a um motivo (parentId).
 * Ao adicionar/editar, além do rótulo escolhe-se o motivo pai. A listagem é
 * agrupada por motivo. Reaproveita `attendance_options` (categoria fixa
 * `detalhe_alta` + parent_id), RLS por clínica.
 */
export function DetalhesAltaConfig({
  motivos,
  detalhes,
}: {
  motivos: MotivoAlta[];
  detalhes: DetalheAlta[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  const [novoLabel, setNovoLabel] = useState("");
  const [novoParent, setNovoParent] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editParent, setEditParent] = useState("");

  const semMotivos = motivos.length === 0;

  function refresh() {
    router.refresh();
  }

  function adicionar() {
    const label = novoLabel.trim();
    if (!label) {
      toast.error("Informe o nome do detalhe.");
      return;
    }
    if (!novoParent) {
      toast.error("Selecione o motivo a que este detalhe pertence.");
      return;
    }
    startTransition(async () => {
      const res = await addAttendanceOption({
        category: CATEGORIA,
        label,
        value: label,
        parentId: novoParent,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Detalhe adicionado.");
      setNovoLabel("");
      setNovoParent("");
      refresh();
    });
  }

  function iniciarEdicao(d: DetalheAlta) {
    setEditId(d.id);
    setEditLabel(d.label);
    setEditParent(d.parentId ?? "");
  }

  function salvarEdicao() {
    if (!editId) return;
    const label = editLabel.trim();
    if (!label) {
      toast.error("O nome do detalhe é obrigatório.");
      return;
    }
    if (!editParent) {
      toast.error("Selecione o motivo a que este detalhe pertence.");
      return;
    }
    startTransition(async () => {
      const res = await updateAttendanceOption(editId, {
        label,
        value: label,
        parentId: editParent,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Detalhe atualizado.");
      setEditId(null);
      refresh();
    });
  }

  async function remover(id: string, label: string) {
    if (!(await confirm({ message: `Remover o detalhe "${label}"? Esta ação não pode ser desfeita.`, danger: true, confirmLabel: "Remover" }))) return;
    startTransition(async () => {
      const res = await removeAttendanceOption(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Detalhe removido.");
      refresh();
    });
  }

  return (
    <Card className="max-w-3xl">
      <CardBody>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <ListTree className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-ink">Detalhes de Alta</h3>
            <p className="text-xs text-muted">
              Detalhes vinculados a cada motivo de alta
            </p>
          </div>
        </div>

        {semMotivos ? (
          <p className="rounded-xl border border-dashed border-line bg-muted-surface p-6 text-center text-sm text-muted">
            Cadastre ao menos um{" "}
            <span className="font-medium text-ink">motivo de alta</span> antes de
            adicionar detalhes.
          </p>
        ) : (
          <>
            {/* Lista agrupada por motivo */}
            <div className="space-y-5">
              {motivos.map((m) => {
                const filhos = detalhes.filter((d) => d.parentId === m.id);
                return (
                  <div key={m.id}>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      {m.label}
                    </h4>
                    {filhos.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">
                        Nenhum detalhe para este motivo.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {filhos.map((opt) => {
                          const emEdicao = editId === opt.id;
                          return (
                            <div
                              key={opt.id}
                              className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3"
                            >
                              {emEdicao ? (
                                <>
                                  <Input
                                    aria-label="Nome do detalhe"
                                    value={editLabel}
                                    onChange={(e) => setEditLabel(e.target.value)}
                                    className="min-w-0 flex-1"
                                    placeholder="Nome do detalhe"
                                  />
                                  <Select
                                    aria-label="Motivo"
                                    value={editParent}
                                    onChange={(e) => setEditParent(e.target.value)}
                                    className="min-w-0 flex-1"
                                  >
                                    {motivos.map((mm) => (
                                      <option key={mm.id} value={mm.id}>
                                        {mm.label}
                                      </option>
                                    ))}
                                  </Select>
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
                                    onClick={() => iniciarEdicao(opt)}
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
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Adicionar novo detalhe */}
            <div className="mt-5 rounded-xl border border-line bg-muted-surface p-4">
              <h4 className="mb-3 text-sm font-semibold text-ink">Adicionar detalhe</h4>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Select
                  id="novo-detalhe-motivo"
                  label="Motivo"
                  value={novoParent}
                  onChange={(e) => setNovoParent(e.target.value)}
                  className="flex-1"
                >
                  <option value="">Selecione…</option>
                  {motivos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </Select>
                <Input
                  id="novo-detalhe-alta"
                  label="Detalhe"
                  value={novoLabel}
                  onChange={(e) => setNovoLabel(e.target.value)}
                  placeholder="Ex.: Alta a pedido"
                  className="flex-1"
                />
                <Button type="button" variant="primary" onClick={adicionar} disabled={pending}>
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
