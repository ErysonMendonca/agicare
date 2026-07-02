"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { criarSolicitacao } from "@/lib/actions/product-requests";
import { SETORES, type Setor } from "@/lib/data/product-requests.shared";

/** Produto disponível para pedido — SEM saldo (o setor não vê estoque). */
export type ProdutoOpcao = { id: string; produto: string; unidade: string };

type Linha = { key: number; productId: string; quantidade: string };
const novaLinha = (key: number): Linha => ({ key, productId: "", quantidade: "" });

export function NovaSolicitacaoModal({
  produtos,
  setorPadrao,
}: {
  produtos: ProdutoOpcao[];
  setorPadrao: Setor;
}) {
  const [open, setOpen] = useState(false);
  const [setor, setSetor] = useState<Setor>(setorPadrao);
  const [urgente, setUrgente] = useState(false);
  const [obs, setObs] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([novaLinha(1)]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function reset() {
    setSetor(setorPadrao);
    setUrgente(false);
    setObs("");
    setLinhas([novaLinha(1)]);
  }

  function fechar() {
    setOpen(false);
    reset();
  }

  function addLinha() {
    setLinhas((prev) => [...prev, novaLinha((prev.at(-1)?.key ?? 0) + 1)]);
  }

  function removeLinha(key: number) {
    setLinhas((prev) =>
      prev.length > 1 ? prev.filter((l) => l.key !== key) : prev,
    );
  }

  function setLinha(key: number, patch: Partial<Linha>) {
    setLinhas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function submit() {
    const items = linhas
      .map((l) => ({
        product_id: l.productId,
        quantity_num: Number(l.quantidade.replace(",", ".")),
      }))
      .filter(
        (i) =>
          i.product_id &&
          Number.isFinite(i.quantity_num) &&
          i.quantity_num > 0,
      );

    if (items.length === 0) {
      toast.error("Adicione ao menos um item com produto e quantidade.");
      return;
    }

    startTransition(async () => {
      const res = await criarSolicitacao({
        setor,
        urgent: urgente,
        notes: obs.trim(),
        items,
      });
      if (res?.ok) {
        toast.success("Solicitação enviada ao estoque.");
        fechar();
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível criar a solicitação.");
      }
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <ClipboardPlus className="h-4 w-4" />
        Nova Solicitação
      </Button>

      <Modal
        open={open}
        onClose={fechar}
        title="Nova Solicitação de Produtos"
        subtitle="Peça produtos ao estoque — a quantidade em estoque não é exibida"
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={fechar}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Enviando..." : "Enviar Solicitação"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            id="ns-setor"
            label="Setor solicitante"
            value={setor}
            onChange={(e) => setSetor(e.target.value as Setor)}
          >
            {SETORES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Itens solicitados</p>
              <Button variant="outline" size="sm" onClick={addLinha} type="button">
                <Plus className="h-4 w-4" /> Adicionar item
              </Button>
            </div>
            <div className="space-y-3">
              {linhas.map((l) => (
                <div key={l.key} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Select
                      value={l.productId}
                      onChange={(e) =>
                        setLinha(l.key, { productId: e.target.value })
                      }
                    >
                      <option value="">Selecione o produto</option>
                      {produtos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.produto} ({p.unidade})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Qtd"
                      value={l.quantidade}
                      onChange={(e) =>
                        setLinha(l.key, { quantidade: e.target.value })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLinha(l.key)}
                    disabled={linhas.length === 1}
                    aria-label="Remover item"
                    className="mb-1 rounded-lg p-2 text-muted hover:text-red-600 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Observação (opcional)
            </span>
            <textarea
              rows={2}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex.: reposição semanal, urgência para o turno da tarde..."
              className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={urgente}
              onChange={(e) => setUrgente(e.target.checked)}
              className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-200"
            />
            Marcar como urgente
          </label>
        </div>
      </Modal>
    </>
  );
}
