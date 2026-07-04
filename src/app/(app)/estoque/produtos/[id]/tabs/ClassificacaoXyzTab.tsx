"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  addProductXyz,
  updateProductXyz,
  removeProductXyz,
} from "@/lib/actions/stock-product-children";
import type { ChildTabProps, ProductXyz } from "../types";
import { TabHeader, TabTable, RowActions, AtivoBadge } from "./_shared";

type Form = {
  xyzClass: "X" | "Y" | "Z";
  startDate: string;
  endDate: string;
  active: boolean;
};
const VAZIO: Form = { xyzClass: "X", startDate: "", endDate: "", active: true };

/** Descrição dos três níveis de criticidade da classificação XYZ. */
const NIVEIS: { classe: "X" | "Y" | "Z"; titulo: string; texto: string }[] = [
  {
    classe: "X",
    titulo: "Classe X: baixa criticidade",
    texto:
      "Materiais cuja falta não paralisa as atividades, consumo estável e fácil reposição.",
  },
  {
    classe: "Y",
    titulo: "Classe Y: média criticidade",
    texto:
      "Demanda moderada, alguma variabilidade, falta causa transtornos sem prejuízo grave.",
  },
  {
    classe: "Z",
    titulo: "Classe Z: alta criticidade",
    texto:
      "Materiais insubstituíveis e essenciais; a falta pode paralisar operações ou gerar grandes prejuízos.",
  },
];

const dataBR = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });

/**
 * Aba "Classificação XYZ" — criticidade do material com vigência (1:N).
 * Inclui bloco explicativo dos três níveis de criticidade.
 */
export function ClassificacaoXyzTab({
  productId,
  data,
}: ChildTabProps<ProductXyz>) {
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

  function abrirEdicao(x: ProductXyz) {
    setEditId(x.id);
    setForm({
      xyzClass: x.xyzClass,
      startDate: x.startDate ?? "",
      endDate: x.endDate ?? "",
      active: x.active,
    });
    setOpen(true);
  }

  function salvar() {
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      toast.error("A data fim não pode ser anterior à data início.");
      return;
    }
    const payload = {
      productId,
      xyzClass: form.xyzClass,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      active: form.active,
    };
    startTransition(async () => {
      const res = editId
        ? await updateProductXyz(editId, payload)
        : await addProductXyz(payload);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        editId ? "Classificação atualizada." : "Classificação adicionada.",
      );
      setOpen(false);
      router.refresh();
    });
  }

  function remover(x: ProductXyz) {
    if (!window.confirm(`Remover a classificação "${x.xyzClass}"?`)) return;
    startTransition(async () => {
      const res = await removeProductXyz(x.id);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Classificação removida.");
      router.refresh();
    });
  }

  return (
    <div className="mt-2">
      <TabHeader
        title="Classificação XYZ"
        description="Criticidade do material com vigência"
        onNew={abrirNovo}
        disabled={pending}
      />

      {/* Bloco explicativo dos níveis de criticidade */}
      <div className="mt-4 rounded-xl border border-line bg-muted-surface p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Info className="h-4 w-4 text-brand-600" />
          Entenda a classificação XYZ
        </div>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {NIVEIS.map((n) => (
            <div
              key={n.classe}
              className="rounded-lg border border-line bg-white p-3"
            >
              <dt className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                  {n.classe}
                </span>
                {n.titulo}
              </dt>
              <dd className="text-xs leading-relaxed text-muted">{n.texto}</dd>
            </div>
          ))}
        </dl>
      </div>

      <TabTable
        headers={["Classificação", "Data Início", "Data Fim", "Ativo"]}
        colSpan={4}
        isEmpty={data.length === 0}
        emptyLabel="Nenhuma classificação cadastrada."
      >
        {data.map((x) => (
          <tr key={x.id} className="border-b border-line last:border-0">
            <td className="px-5 py-3 font-medium text-ink">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                {x.xyzClass}
              </span>
            </td>
            <td className="px-5 py-3 text-muted">
              {x.startDate ? dataBR(x.startDate) : "—"}
            </td>
            <td className="px-5 py-3 text-muted">
              {x.endDate ? dataBR(x.endDate) : "—"}
            </td>
            <td className="px-5 py-3">
              <AtivoBadge active={x.active} />
            </td>
            <RowActions
              label={`classe ${x.xyzClass}`}
              onEdit={() => abrirEdicao(x)}
              onRemove={() => remover(x)}
              disabled={pending}
            />
          </tr>
        ))}
      </TabTable>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Editar Classificação XYZ" : "Nova Classificação XYZ"}
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
          <Select
            id="xyz-classe"
            label="Classificação *"
            className="sm:col-span-2"
            value={form.xyzClass}
            onChange={(e) =>
              setForm({ ...form, xyzClass: e.target.value as "X" | "Y" | "Z" })
            }
          >
            <option value="X">X — baixa criticidade</option>
            <option value="Y">Y — média criticidade</option>
            <option value="Z">Z — alta criticidade</option>
          </Select>
          <Input
            id="xyz-inicio"
            label="Data Início"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
          />
          <Input
            id="xyz-fim"
            label="Data Fim"
            type="date"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
          />
          <Select
            id="xyz-ativo"
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
