"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  addProductRequisitionLocation,
  updateProductRequisitionLocation,
  removeProductRequisitionLocation,
} from "@/lib/actions/stock-product-children";
import type { ChildTabProps, ProductRequisitionLocation } from "../types";
import { TabHeader, TabTable, RowActions, AtivoBadge } from "./_shared";

/**
 * Aba "Localização para Requisição" — locais de requisição do produto (1:N).
 */
export function LocalizacoesTab({
  productId,
  data,
}: ChildTabProps<ProductRequisitionLocation>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [active, setActive] = useState(true);

  function abrirNovo() {
    setEditId(null);
    setLocationLabel("");
    setActive(true);
    setOpen(true);
  }

  function abrirEdicao(l: ProductRequisitionLocation) {
    setEditId(l.id);
    setLocationLabel(l.locationLabel);
    setActive(l.active);
    setOpen(true);
  }

  function salvar() {
    if (!locationLabel.trim()) {
      toast.error("Localização é obrigatória.");
      return;
    }
    const payload = { productId, locationLabel: locationLabel.trim(), active };
    startTransition(async () => {
      const res = editId
        ? await updateProductRequisitionLocation(editId, payload)
        : await addProductRequisitionLocation(payload);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        editId ? "Localização atualizada." : "Localização adicionada.",
      );
      setOpen(false);
      router.refresh();
    });
  }

  function remover(l: ProductRequisitionLocation) {
    if (!window.confirm(`Remover a localização "${l.locationLabel}"?`)) return;
    startTransition(async () => {
      const res = await removeProductRequisitionLocation(l.id);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Localização removida.");
      router.refresh();
    });
  }

  return (
    <div className="mt-2">
      <TabHeader
        title="Localizações para Requisição"
        description="Locais de requisição do produto"
        onNew={abrirNovo}
        disabled={pending}
      />

      <TabTable
        headers={["Localização", "Ativo"]}
        colSpan={2}
        isEmpty={data.length === 0}
        emptyLabel="Nenhuma localização cadastrada."
      >
        {data.map((l) => (
          <tr key={l.id} className="border-b border-line last:border-0">
            <td className="px-5 py-3 font-medium text-ink">{l.locationLabel}</td>
            <td className="px-5 py-3">
              <AtivoBadge active={l.active} />
            </td>
            <RowActions
              label={l.locationLabel}
              onEdit={() => abrirEdicao(l)}
              onRemove={() => remover(l)}
              disabled={pending}
            />
          </tr>
        ))}
      </TabTable>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Editar Localização" : "Nova Localização"}
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
          <Input
            id="loc-label"
            label="Localização *"
            placeholder="Ex.: Prateleira A3"
            value={locationLabel}
            onChange={(e) => setLocationLabel(e.target.value)}
          />
          <Select
            id="loc-ativo"
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
