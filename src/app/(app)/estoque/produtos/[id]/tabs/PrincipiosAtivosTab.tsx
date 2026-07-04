"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/lib/store/confirm";
import { Modal } from "@/components/ui/Modal";
import type { AttendanceOptionsByCategory } from "@/lib/data/attendance-options.shared";
import {
  addProductActiveIngredient,
  updateProductActiveIngredient,
  removeProductActiveIngredient,
} from "@/lib/actions/stock-product-children";
import type { ChildTabProps, ProductActiveIngredient } from "../types";
import { TabHeader, TabTable, RowActions, AtivoBadge } from "./_shared";

/**
 * Aba "Princípio Ativo" — princípios ativos do produto (1:N).
 * Catálogo: `principio_ativo` (via `options`, opcional).
 */
export function PrincipiosAtivosTab({
  productId,
  data,
  options,
}: ChildTabProps<ProductActiveIngredient> & {
  options?: AttendanceOptionsByCategory;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [ingredientLabel, setIngredientLabel] = useState("");
  const [active, setActive] = useState(true);

  const principios = options?.["principio_ativo"] ?? [];

  function abrirNovo() {
    setEditId(null);
    setIngredientLabel("");
    setActive(true);
    setOpen(true);
  }

  function abrirEdicao(i: ProductActiveIngredient) {
    setEditId(i.id);
    setIngredientLabel(i.ingredientLabel);
    setActive(i.active);
    setOpen(true);
  }

  function salvar() {
    if (!ingredientLabel.trim()) {
      toast.error("Princípio Ativo é obrigatório.");
      return;
    }
    const payload = {
      productId,
      ingredientLabel: ingredientLabel.trim(),
      active,
    };
    startTransition(async () => {
      const res = editId
        ? await updateProductActiveIngredient(editId, payload)
        : await addProductActiveIngredient(payload);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(editId ? "Princípio atualizado." : "Princípio adicionado.");
      setOpen(false);
      router.refresh();
    });
  }

  async function remover(i: ProductActiveIngredient) {
    if (!(await confirm({ message: `Remover o princípio "${i.ingredientLabel}"?`, danger: true, confirmLabel: "Remover" }))) return;
    startTransition(async () => {
      const res = await removeProductActiveIngredient(i.id);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Princípio removido.");
      router.refresh();
    });
  }

  return (
    <div className="mt-2">
      <TabHeader
        title="Princípios Ativos"
        description="Princípios ativos do produto"
        onNew={abrirNovo}
        disabled={pending}
      />

      <TabTable
        headers={["Princípio Ativo", "Ativo"]}
        colSpan={2}
        isEmpty={data.length === 0}
        emptyLabel="Nenhum princípio ativo cadastrado."
      >
        {data.map((i) => (
          <tr key={i.id} className="border-b border-line last:border-0">
            <td className="px-5 py-3 font-medium text-ink">
              {i.ingredientLabel}
            </td>
            <td className="px-5 py-3">
              <AtivoBadge active={i.active} />
            </td>
            <RowActions
              label={i.ingredientLabel}
              onEdit={() => abrirEdicao(i)}
              onRemove={() => remover(i)}
              disabled={pending}
            />
          </tr>
        ))}
      </TabTable>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Editar Princípio Ativo" : "Novo Princípio Ativo"}
        className="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            id="pa-label"
            label="Princípio Ativo *"
            value={ingredientLabel}
            onChange={(e) => setIngredientLabel(e.target.value)}
          >
            <option value="">Selecione</option>
            {ingredientLabel &&
              !principios.some((o) => o.value === ingredientLabel) && (
                <option value={ingredientLabel}>{ingredientLabel}</option>
              )}
            {principios.map((o) => (
              <option key={o.id} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Select
            id="pa-ativo"
            label="Situação"
            value={active ? "true" : "false"}
            onChange={(e) => setActive(e.target.value === "true")}
          >
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </Select>
        </div>
      </Modal>
    </div>
  );
}
