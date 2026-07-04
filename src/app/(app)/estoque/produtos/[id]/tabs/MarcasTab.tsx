"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { AttendanceOptionsByCategory } from "@/lib/data/attendance-options.shared";
import {
  addProductBrand,
  updateProductBrand,
  removeProductBrand,
} from "@/lib/actions/stock-product-children";
import type { ChildTabProps, ProductBrand } from "../types";
import { TabHeader, TabTable, RowActions, AtivoBadge } from "./_shared";

type Form = {
  brandLabel: string;
  anvisaRegistration: string;
  registrationExpiry: string;
  active: boolean;
};
const VAZIO: Form = {
  brandLabel: "",
  anvisaRegistration: "",
  registrationExpiry: "",
  active: true,
};

/**
 * Aba "Marca" — marcas do produto com registro ANVISA e validade (1:N).
 * Catálogo opcional: `marca` (quando ausente, aceita texto livre).
 */
export function MarcasTab({
  productId,
  data,
  options,
}: ChildTabProps<ProductBrand> & { options?: AttendanceOptionsByCategory }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(VAZIO);

  const marcas = options?.["marca"] ?? [];

  function abrirNovo() {
    setEditId(null);
    setForm(VAZIO);
    setOpen(true);
  }

  function abrirEdicao(b: ProductBrand) {
    setEditId(b.id);
    setForm({
      brandLabel: b.brandLabel,
      anvisaRegistration: b.anvisaRegistration ?? "",
      registrationExpiry: b.registrationExpiry ?? "",
      active: b.active,
    });
    setOpen(true);
  }

  function salvar() {
    if (!form.brandLabel.trim()) {
      toast.error("Marca é obrigatória.");
      return;
    }
    const payload = {
      productId,
      brandLabel: form.brandLabel.trim(),
      anvisaRegistration: form.anvisaRegistration.trim() || undefined,
      registrationExpiry: form.registrationExpiry || undefined,
      active: form.active,
    };
    startTransition(async () => {
      const res = editId
        ? await updateProductBrand(editId, payload)
        : await addProductBrand(payload);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(editId ? "Marca atualizada." : "Marca adicionada.");
      setOpen(false);
      router.refresh();
    });
  }

  function remover(b: ProductBrand) {
    if (!window.confirm(`Remover a marca "${b.brandLabel}"?`)) return;
    startTransition(async () => {
      const res = await removeProductBrand(b.id);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Marca removida.");
      router.refresh();
    });
  }

  return (
    <div className="mt-2">
      <TabHeader
        title="Marcas"
        description="Marcas do produto com registro ANVISA"
        onNew={abrirNovo}
        disabled={pending}
      />

      <TabTable
        headers={["Marca", "Nº Registro Anvisa", "Vencimento Registro", "Ativo"]}
        colSpan={4}
        isEmpty={data.length === 0}
        emptyLabel="Nenhuma marca cadastrada."
      >
        {data.map((b) => (
          <tr key={b.id} className="border-b border-line last:border-0">
            <td className="px-5 py-3 font-medium text-ink">{b.brandLabel}</td>
            <td className="px-5 py-3 text-muted">
              {b.anvisaRegistration ?? "—"}
            </td>
            <td className="px-5 py-3 text-muted">
              {b.registrationExpiry
                ? new Date(b.registrationExpiry).toLocaleDateString("pt-BR", {
                    timeZone: "UTC",
                  })
                : "—"}
            </td>
            <td className="px-5 py-3">
              <AtivoBadge active={b.active} />
            </td>
            <RowActions
              label={b.brandLabel}
              onEdit={() => abrirEdicao(b)}
              onRemove={() => remover(b)}
              disabled={pending}
            />
          </tr>
        ))}
      </TabTable>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Editar Marca" : "Nova Marca"}
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
          {marcas.length > 0 ? (
            <Select
              id="mc-marca"
              label="Marca *"
              className="sm:col-span-2"
              value={form.brandLabel}
              onChange={(e) => setForm({ ...form, brandLabel: e.target.value })}
            >
              <option value="">Selecione</option>
              {form.brandLabel &&
                !marcas.some((o) => o.value === form.brandLabel) && (
                  <option value={form.brandLabel}>{form.brandLabel}</option>
                )}
              {marcas.map((o) => (
                <option key={o.id} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id="mc-marca"
              label="Marca *"
              className="sm:col-span-2"
              placeholder="Ex.: Cristália"
              value={form.brandLabel}
              onChange={(e) => setForm({ ...form, brandLabel: e.target.value })}
            />
          )}
          <Input
            id="mc-anvisa"
            label="Nº Registro Anvisa"
            placeholder="Ex.: 1.0000.0000.000-0"
            value={form.anvisaRegistration}
            onChange={(e) =>
              setForm({ ...form, anvisaRegistration: e.target.value })
            }
          />
          <Input
            id="mc-vencimento"
            label="Vencimento Registro"
            type="date"
            value={form.registrationExpiry}
            onChange={(e) =>
              setForm({ ...form, registrationExpiry: e.target.value })
            }
          />
          <Select
            id="mc-ativo"
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
