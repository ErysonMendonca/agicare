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
import {
  SETORES,
  type Setor,
  type SetorFornecedorOption,
} from "@/lib/data/product-requests.shared";

/** Produto disponível para pedido — SEM saldo (o setor não vê estoque). */
export type ProdutoOpcao = { id: string; produto: string; unidade: string };

type Linha = { key: number; produto: string; quantidade: string };
const novaLinha = (key: number): Linha => ({ key, produto: "", quantidade: "" });

/** Rótulo exibido/pesquisável de um produto no datalist. */
const rotuloProduto = (p: ProdutoOpcao) => `${p.produto} (${p.unidade})`;

export function NovaSolicitacaoModal({
  produtos,
  setorPadrao,
  setoresFornecedor,
}: {
  produtos: ProdutoOpcao[];
  setorPadrao: Setor;
  setoresFornecedor: SetorFornecedorOption[];
}) {
  const [open, setOpen] = useState(false);
  const [setor, setSetor] = useState<Setor>(setorPadrao);
  const [fornecedor, setFornecedor] = useState<string>(
    setoresFornecedor[0]?.value ?? "",
  );
  const [urgente, setUrgente] = useState(false);
  const [obs, setObs] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([novaLinha(1)]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function reset() {
    setSetor(setorPadrao);
    setFornecedor(setoresFornecedor[0]?.value ?? "");
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
    // Resolve o texto digitado (datalist) para o id do produto. Casa pelo rótulo
    // completo "Nome (unidade)" e, como fallback tolerante, só pelo nome.
    const norm = (s: string) => s.trim().toLowerCase();
    const porRotulo = new Map(produtos.map((p) => [norm(rotuloProduto(p)), p.id]));
    const porNome = new Map(produtos.map((p) => [norm(p.produto), p.id]));

    const digitouSemCasar = linhas.some(
      (l) =>
        l.produto.trim() !== "" &&
        !porRotulo.has(norm(l.produto)) &&
        !porNome.has(norm(l.produto)),
    );

    const items = linhas
      .map((l) => ({
        product_id: porRotulo.get(norm(l.produto)) ?? porNome.get(norm(l.produto)) ?? "",
        quantity_num: Number(l.quantidade.replace(",", ".")),
      }))
      .filter(
        (i) =>
          i.product_id &&
          Number.isFinite(i.quantity_num) &&
          i.quantity_num > 0,
      );

    if (items.length === 0) {
      toast.error(
        digitouSemCasar
          ? "Selecione um produto da lista (o texto digitado não corresponde a nenhum item)."
          : "Adicione ao menos um item com produto e quantidade.",
      );
      return;
    }

    if (!fornecedor) {
      toast.error("Selecione o setor fornecedor.");
      return;
    }

    startTransition(async () => {
      const res = await criarSolicitacao({
        setor,
        supplierSector: fornecedor,
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

            <Select
              id="ns-fornecedor"
              label="Setor fornecedor"
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
              required
            >
              <option value="">Selecione o setor fornecedor</option>
              {setoresFornecedor.map((s) => (
                <option key={s.id} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Itens solicitados</p>
              <Button variant="outline" size="sm" onClick={addLinha} type="button">
                <Plus className="h-4 w-4" /> Adicionar item
              </Button>
            </div>
            <datalist id="ns-produtos-lista">
              {produtos.map((p) => (
                <option key={p.id} value={rotuloProduto(p)} />
              ))}
            </datalist>
            <div className="space-y-3">
              {linhas.map((l) => (
                <div key={l.key} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      list="ns-produtos-lista"
                      placeholder="Digite ou selecione o produto"
                      value={l.produto}
                      onChange={(e) => setLinha(l.key, { produto: e.target.value })}
                    />
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
