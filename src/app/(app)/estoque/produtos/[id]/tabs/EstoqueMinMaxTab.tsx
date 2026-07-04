"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  addProductMinMax,
  updateProductMinMax,
  removeProductMinMax,
} from "@/lib/actions/stock-product-children";
import type { ChildTabProps, ProductMinMax } from "../types";
import { TabHeader, TabTable, RowActions, AtivoBadge } from "./_shared";

type Form = { minQuantity: string; maxQuantity: string; active: boolean };
const VAZIO: Form = { minQuantity: "", maxQuantity: "", active: true };

/**
 * Aba "Estoque Mínimo e Máximo" — limites de estoque da empresa/clínica (1:N).
 * A empresa vem do escopo da clínica (RLS) — exibida só para leitura.
 */
export function EstoqueMinMaxTab({
  productId,
  data,
}: ChildTabProps<ProductMinMax>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(VAZIO);

  function abrirNovo() {
    setEditId(null);
    setForm(VAZIO);
    setOpen(true);
  }

  function abrirEdicao(m: ProductMinMax) {
    setEditId(m.id);
    setForm({
      minQuantity: m.minQuantity?.toString() ?? "",
      maxQuantity: m.maxQuantity?.toString() ?? "",
      active: m.active,
    });
    setOpen(true);
  }

  function salvar() {
    const min = form.minQuantity === "" ? null : Number(form.minQuantity);
    const max = form.maxQuantity === "" ? null : Number(form.maxQuantity);
    if (min !== null && max !== null && max < min) {
      toast.error("O máximo não pode ser menor que o mínimo.");
      return;
    }
    const payload = {
      productId,
      minQuantity: min ?? 0,
      maxQuantity: max ?? 0,
      active: form.active,
    };
    startTransition(async () => {
      const res = editId
        ? await updateProductMinMax(editId, payload)
        : await addProductMinMax(payload);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(editId ? "Limite atualizado." : "Limite adicionado.");
      setOpen(false);
      router.refresh();
    });
  }

  function remover(m: ProductMinMax) {
    if (!window.confirm("Remover este limite de estoque?")) return;
    startTransition(async () => {
      const res = await removeProductMinMax(m.id);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Limite removido.");
      router.refresh();
    });
  }

  return (
    <div className="mt-2">
      <TabHeader
        title="Estoque Mínimo e Máximo"
        description="Limites de estoque da empresa"
        onNew={abrirNovo}
        disabled={pending}
      />

      <TabTable
        headers={["Empresa", "Mínimo", "Máximo", "Ativo"]}
        colSpan={4}
        isEmpty={data.length === 0}
        emptyLabel="Nenhum limite cadastrado."
      >
        {data.map((m) => (
          <tr key={m.id} className="border-b border-line last:border-0">
            <td className="px-5 py-3 font-medium text-ink">Esta clínica</td>
            <td className="px-5 py-3 text-muted">{m.minQuantity ?? "—"}</td>
            <td className="px-5 py-3 text-muted">{m.maxQuantity ?? "—"}</td>
            <td className="px-5 py-3">
              <AtivoBadge active={m.active} />
            </td>
            <RowActions
              label="limite de estoque"
              onEdit={() => abrirEdicao(m)}
              onRemove={() => remover(m)}
              disabled={pending}
            />
          </tr>
        ))}
      </TabTable>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Editar Limite" : "Novo Limite"}
        subtitle="Estoque mínimo e máximo para esta empresa"
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="mm-min"
            label="Mínimo"
            type="number"
            step="0.01"
            min={0}
            value={form.minQuantity}
            onChange={(e) => setForm({ ...form, minQuantity: e.target.value })}
          />
          <Input
            id="mm-max"
            label="Máximo"
            type="number"
            step="0.01"
            min={0}
            value={form.maxQuantity}
            onChange={(e) => setForm({ ...form, maxQuantity: e.target.value })}
          />
          <Select
            id="mm-ativo"
            label="Situação"
            className="sm:col-span-2"
            value={form.active ? "true" : "false"}
            onChange={(e) =>
              setForm({ ...form, active: e.target.value === "true" })
            }
          >
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </Select>
        </div>
      </Modal>
    </div>
  );
}
