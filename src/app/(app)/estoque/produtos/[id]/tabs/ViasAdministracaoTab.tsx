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
  addProductAdminRoute,
  updateProductAdminRoute,
  removeProductAdminRoute,
} from "@/lib/actions/stock-product-children";
import type { ChildTabProps, ProductAdminRoute } from "../types";
import { TabHeader, TabTable, RowActions, AtivoBadge } from "./_shared";

/**
 * Aba "Via de Administração" — vias associadas ao produto (1:N).
 * Catálogo: `via_administracao` (via `options`, opcional).
 */
export function ViasAdministracaoTab({
  productId,
  data,
  options,
}: ChildTabProps<ProductAdminRoute> & {
  options?: AttendanceOptionsByCategory;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [routeLabel, setRouteLabel] = useState("");
  const [active, setActive] = useState(true);

  const vias = options?.["via_administracao"] ?? [];

  function abrirNovo() {
    setEditId(null);
    setRouteLabel("");
    setActive(true);
    setOpen(true);
  }

  function abrirEdicao(r: ProductAdminRoute) {
    setEditId(r.id);
    setRouteLabel(r.routeLabel);
    setActive(r.active);
    setOpen(true);
  }

  function salvar() {
    if (!routeLabel.trim()) {
      toast.error("Via de Administração é obrigatória.");
      return;
    }
    const payload = { productId, routeLabel: routeLabel.trim(), active };
    startTransition(async () => {
      const res = editId
        ? await updateProductAdminRoute(editId, payload)
        : await addProductAdminRoute(payload);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(editId ? "Via atualizada." : "Via adicionada.");
      setOpen(false);
      router.refresh();
    });
  }

  async function remover(r: ProductAdminRoute) {
    if (!(await confirm({ message: `Remover a via "${r.routeLabel}"?`, danger: true, confirmLabel: "Remover" }))) return;
    startTransition(async () => {
      const res = await removeProductAdminRoute(r.id);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Via removida.");
      router.refresh();
    });
  }

  return (
    <div className="mt-2">
      <TabHeader
        title="Vias de Administração"
        description="Vias associadas ao produto"
        onNew={abrirNovo}
        disabled={pending}
      />

      <TabTable
        headers={["Via de Administração", "Ativo"]}
        colSpan={2}
        isEmpty={data.length === 0}
        emptyLabel="Nenhuma via cadastrada."
      >
        {data.map((r) => (
          <tr key={r.id} className="border-b border-line last:border-0">
            <td className="px-5 py-3 font-medium text-ink">{r.routeLabel}</td>
            <td className="px-5 py-3">
              <AtivoBadge active={r.active} />
            </td>
            <RowActions
              label={r.routeLabel}
              onEdit={() => abrirEdicao(r)}
              onRemove={() => remover(r)}
              disabled={pending}
            />
          </tr>
        ))}
      </TabTable>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Editar Via" : "Nova Via de Administração"}
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
            id="via-label"
            label="Via de Administração *"
            value={routeLabel}
            onChange={(e) => setRouteLabel(e.target.value)}
          >
            <option value="">Selecione</option>
            {routeLabel && !vias.some((o) => o.value === routeLabel) && (
              <option value={routeLabel}>{routeLabel}</option>
            )}
            {vias.map((o) => (
              <option key={o.id} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Select
            id="via-ativo"
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
