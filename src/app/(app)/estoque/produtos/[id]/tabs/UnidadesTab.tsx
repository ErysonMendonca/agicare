"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/lib/store/confirm";
import { Modal } from "@/components/ui/Modal";
import type { AttendanceOptionsByCategory } from "@/lib/data/attendance-options.shared";
import {
  addProductUnit,
  updateProductUnit,
  removeProductUnit,
} from "@/lib/actions/stock-product-children";
import type { ChildTabProps, ProductUnit } from "../types";
import { TabHeader, TabTable, RowActions, AtivoBadge } from "./_shared";

type Form = {
  apresentacao: string;
  ordem: string;
  quantidade: string;
  unitLabel: string;
  unitType: string;
  controlaEstoque: boolean;
  active: boolean;
};

const VAZIO: Form = {
  apresentacao: "",
  ordem: "",
  quantidade: "",
  unitLabel: "",
  unitType: "PRINCIPAL",
  controlaEstoque: true,
  active: true,
};

/**
 * Aba "Unidade de Medida" — apresentações/unidades do produto (1:N).
 * Campo "Unidade de Medida" é obrigatório. Catálogo: `unidade_medida`.
 * `options` é opcional (o shell pode não passar): sem catálogo, o select
 * ainda preserva o valor já gravado ao editar.
 */
export function UnidadesTab({
  productId,
  data,
  options,
}: ChildTabProps<ProductUnit> & { options?: AttendanceOptionsByCategory }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(VAZIO);

  const unidades = options?.["unidade_medida"] ?? [];

  function abrirNovo() {
    setEditId(null);
    setForm(VAZIO);
    setOpen(true);
  }

  function abrirEdicao(u: ProductUnit) {
    setEditId(u.id);
    setForm({
      apresentacao: u.apresentacao ?? "",
      ordem: u.ordem?.toString() ?? "",
      quantidade: u.quantidade?.toString() ?? "",
      unitLabel: u.unitLabel ?? "",
      unitType: u.unitType ?? "PRINCIPAL",
      controlaEstoque: u.controlaEstoque,
      active: u.active,
    });
    setOpen(true);
  }

  function salvar() {
    if (!form.unitLabel.trim()) {
      toast.error("Unidade de Medida é obrigatória.");
      return;
    }
    const payload = {
      productId,
      apresentacao: form.apresentacao.trim() || undefined,
      ordem: form.ordem === "" ? undefined : Number(form.ordem),
      quantidade: form.quantidade === "" ? undefined : Number(form.quantidade),
      unitLabel: form.unitLabel.trim(),
      unitType: form.unitType,
      controlaEstoque: form.controlaEstoque,
      active: form.active,
    };
    startTransition(async () => {
      const res = editId
        ? await updateProductUnit(editId, payload)
        : await addProductUnit(payload);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(editId ? "Unidade atualizada." : "Unidade adicionada.");
      setOpen(false);
      router.refresh();
    });
  }

  async function remover(u: ProductUnit) {
    if (!(await confirm({ message: `Remover a unidade "${u.unitLabel ?? ""}"?`, danger: true, confirmLabel: "Remover" }))) return;
    startTransition(async () => {
      const res = await removeProductUnit(u.id);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Unidade removida.");
      router.refresh();
    });
  }

  return (
    <div className="mt-2">
      <TabHeader
        title="Unidades de Medida"
        description="Apresentações e unidades de medida do produto"
        onNew={abrirNovo}
        disabled={pending}
      />

      <TabTable
        headers={[
          "Apresentação",
          "Ordem",
          "Quantidade",
          "Unidade de Medida",
          "Tipo",
          "Controla Estoque",
          "Ativo",
        ]}
        colSpan={7}
        isEmpty={data.length === 0}
        emptyLabel="Nenhuma unidade cadastrada."
      >
        {data.map((u) => (
          <tr key={u.id} className="border-b border-line last:border-0">
            <td className="px-5 py-3 font-medium text-ink">
              {u.apresentacao ?? "—"}
            </td>
            <td className="px-5 py-3 text-muted">{u.ordem ?? "—"}</td>
            <td className="px-5 py-3 text-muted">{u.quantidade ?? "—"}</td>
            <td className="px-5 py-3 text-ink">{u.unitLabel ?? "—"}</td>
            <td className="px-5 py-3 text-muted">{u.unitType ?? "—"}</td>
            <td className="px-5 py-3 text-muted">
              {u.controlaEstoque ? "Sim" : "Não"}
            </td>
            <td className="px-5 py-3">
              <AtivoBadge active={u.active} />
            </td>
            <RowActions
              label={u.unitLabel ?? "unidade"}
              onEdit={() => abrirEdicao(u)}
              onRemove={() => remover(u)}
              disabled={pending}
            />
          </tr>
        ))}
      </TabTable>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Editar Unidade" : "Nova Unidade"}
        subtitle="Apresentação e unidade de medida do produto"
        className="max-w-xl"
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
            id="un-apresentacao"
            label="Apresentação"
            placeholder="Ex.: Caixa com 10"
            value={form.apresentacao}
            onChange={(e) => setForm({ ...form, apresentacao: e.target.value })}
            className="sm:col-span-2"
          />
          <Input
            id="un-ordem"
            label="Ordem"
            type="number"
            value={form.ordem}
            onChange={(e) => setForm({ ...form, ordem: e.target.value })}
          />
          <Input
            id="un-quantidade"
            label="Quantidade"
            type="number"
            step="0.01"
            value={form.quantidade}
            onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
          />
          <Select
            id="un-unidade"
            label="Unidade de Medida *"
            value={form.unitLabel}
            onChange={(e) => setForm({ ...form, unitLabel: e.target.value })}
          >
            <option value="">Selecione</option>
            {form.unitLabel &&
              !unidades.some((o) => o.value === form.unitLabel) && (
                <option value={form.unitLabel}>{form.unitLabel}</option>
              )}
            {unidades.map((o) => (
              <option key={o.id} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Select
            id="un-tipo"
            label="Tipo Unidade Medida"
            value={form.unitType}
            onChange={(e) => setForm({ ...form, unitType: e.target.value })}
          >
            <option value="PRINCIPAL">PRINCIPAL</option>
            <option value="SECUNDARIA">SECUNDARIA</option>
          </Select>
          <Select
            id="un-controla"
            label="Controla Estoque"
            value={form.controlaEstoque ? "true" : "false"}
            onChange={(e) =>
              setForm({ ...form, controlaEstoque: e.target.value === "true" })
            }
          >
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </Select>
          <Select
            id="un-ativo"
            label="Situação"
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
