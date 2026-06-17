"use client";

import { useMemo, useState, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { registrarEntrada } from "@/lib/actions/stock";
import { type Fornecedor, type ProdutoEstoque } from "@/lib/data/stock";

type Linha = { key: number; productId: string; quantidade: string };

/**
 * Botão "Nova Entrada" + modal de recebimento por Nota Fiscal com MÚLTIPLOS
 * itens. Cada item (produto + quantidade) vira um movimento 'entrada' e
 * incrementa o saldo do produto (trigger 0038). Os itens válidos são
 * serializados no campo oculto `items` (JSON) lido pela Server Action.
 */
export function EntradaModal({
  fornecedores,
  produtos,
  gestor,
}: {
  fornecedores: Fornecedor[];
  produtos: ProdutoEstoque[];
  gestor: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>([
    { key: 1, productId: "", quantidade: "" },
  ]);
  const [state, formAction, pending] = useActionState(registrarEntrada, undefined);
  const router = useRouter();

  const disponiveis = useMemo(() => produtos.filter((p) => p.ativo), [produtos]);

  useEffect(() => {
    if (state?.ok) {
      toast.success("Entrada registrada com sucesso!");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
       
      setLinhas([{ key: 1, productId: "", quantidade: "" }]);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  function addLinha() {
    setLinhas((prev) => [
      ...prev,
      { key: (prev.at(-1)?.key ?? 0) + 1, productId: "", quantidade: "" },
    ]);
  }

  function removeLinha(key: number) {
    setLinhas((prev) =>
      prev.length > 1 ? prev.filter((l) => l.key !== key) : prev,
    );
  }

  function setLinha(key: number, patch: Partial<Linha>) {
    setLinhas((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  // Itens válidos (produto + quantidade > 0) serializados p/ a action.
  const itensJson = JSON.stringify(
    linhas
      .map((l) => ({
        product_id: l.productId,
        quantity: Number(l.quantidade.replace(",", ".")),
      }))
      .filter(
        (i) => i.product_id && Number.isFinite(i.quantity) && i.quantity > 0,
      ),
  );

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <ArrowDownToLine className="h-4 w-4" />
        Nova Entrada
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Entrada de Produtos"
        subtitle="Registre o recebimento vinculado a uma Nota Fiscal"
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-entrada" disabled={pending}>
              {pending ? "Registrando..." : "Registrar Entrada"}
            </Button>
          </>
        }
      >
        <form id="form-entrada" action={formAction} className="space-y-4">
          <input type="hidden" name="items" value={itensJson} />

          <Input
            id="en-nf"
            name="invoice_number"
            label="Nota Fiscal"
            placeholder="NF-e 0000000"
            required
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select id="en-fornecedor" name="supplier_id" label="Fornecedor" defaultValue="">
              <option value="">Selecione</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
            {gestor ? (
              <Input
                id="en-valor"
                name="total_value"
                label="Valor total (R$)"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
              />
            ) : (
              <input type="hidden" name="total_value" value="0" />
            )}
          </div>

          {/* Itens da NF */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Itens recebidos</p>
              <Button variant="outline" size="sm" onClick={addLinha} type="button">
                <Plus className="h-4 w-4" /> Adicionar item
              </Button>
            </div>
            <div className="space-y-2">
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
                      {disponiveis.map((p) => (
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

          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {state.error}
            </p>
          )}
        </form>
      </Modal>
    </>
  );
}
