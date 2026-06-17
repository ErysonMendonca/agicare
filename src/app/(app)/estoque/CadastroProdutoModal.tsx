"use client";

import { useState, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { createStockProduct } from "@/lib/actions/stock";
import { type Fornecedor } from "@/lib/data/stock";

const CATEGORIAS = ["Medicamento", "Material", "Solução", "Insumo", "EPI"];
const UNIDADES = ["unidade", "ampola", "caixa", "frasco", "comprimido", "pacote"];

/** Gera um código sugerido (prefixo da categoria + número). */
function gerarCodigo(categoria: string): string {
  const prefixo = (categoria || "PRD").slice(0, 3).toUpperCase();
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${prefixo}-${num}`;
}

/**
 * Botão "Novo Produto" + modal de cadastro.
 * Campos financeiros (custo/preço) só aparecem para gestor (LGPD/estratégico).
 */
export function CadastroProdutoModal({
  fornecedores,
  gestor,
}: {
  fornecedores: Fornecedor[];
  gestor: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [codigo, setCodigo] = useState(() => gerarCodigo(CATEGORIAS[0]));
  const [state, formAction, pending] = useActionState(
    createStockProduct,
    undefined,
  );
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success("Produto cadastrado com sucesso!");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  function onCategoria(value: string) {
    setCategoria(value);
    setCodigo(gerarCodigo(value));
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Novo Produto
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Cadastro de Produto"
        subtitle="Preencha os dados do produto de estoque"
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-produto" disabled={pending}>
              {pending ? "Salvando..." : "Salvar Produto"}
            </Button>
          </>
        }
      >
        <form id="form-produto" action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="pr-codigo"
              name="code"
              label="Código (automático)"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
            />
            <Input
              id="pr-nome"
              name="name"
              label="Nome do produto"
              placeholder="Ex.: Dipirona 500mg (ampola)"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              id="pr-categoria"
              name="category"
              label="Categoria"
              value={categoria}
              onChange={(e) => onCategoria(e.target.value)}
            >
              {CATEGORIAS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Select id="pr-unidade" name="unit" label="Unidade" defaultValue="unidade">
              {UNIDADES.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input id="pr-saldo" name="quantity" label="Saldo atual" type="number" min={0} defaultValue={0} />
            <Input id="pr-minimo" name="min_quantity" label="Estoque mínimo" type="number" min={0} defaultValue={0} />
            <Input id="pr-lote" name="lot" label="Lote" placeholder="LT-0000" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input id="pr-validade" name="expiry" label="Validade" type="date" />
            <Input id="pr-local" name="location" label="Localização" placeholder="Ex.: Prateleira A3" />
          </div>

          {/* Campos financeiros — restritos ao gestor */}
          {gestor ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input id="pr-custo" name="cost" label="Custo unitário (R$)" type="number" min={0} step="0.01" defaultValue={0} />
              <Input id="pr-preco" name="price" label="Preço de venda (R$)" type="number" min={0} step="0.01" defaultValue={0} />
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-line bg-muted-surface px-3 py-2.5 text-xs text-muted">
              <Lock className="h-4 w-4" />
              Custo e preço são restritos ao gestor.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select id="pr-fornecedor" name="supplier_id" label="Fornecedor" defaultValue="">
              <option value="">Selecione</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
            <Select id="pr-ativo" name="active" label="Situação" defaultValue="true">
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </Select>
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
