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
const UNIDADES = [
  "unidade",
  "ampola",
  "caixa",
  "frasco",
  "comprimido",
  "cápsula",
  "pacote",
  "bisnaga",
  "litro",
  "mililitro",
];
// Controle especial (Portaria SVS/MS 344/98) — null/"" = não controlado.
const CONTROLES = [
  "",
  "Tarja vermelha (venda sob prescrição)",
  "Tarja vermelha c/ retenção",
  "Tarja preta (controle especial)",
  "Antimicrobiano (RDC 20/2011)",
  "Tarja amarela",
];

const inputTextarea =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

/**
 * Botão "Novo Produto" + modal de cadastro completo (grau farmácia).
 * O CÓDIGO é gerado automaticamente pelo sistema (sequencial por clínica, 0058)
 * — não é digitável. Campos financeiros (custo/preço) só aparecem para gestor.
 */
export function CadastroProdutoModal({
  fornecedores,
  gestor,
}: {
  fornecedores: Fornecedor[];
  gestor: boolean;
}) {
  const [open, setOpen] = useState(false);
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
        subtitle="Cadastro completo do produto/medicamento no catálogo da clínica"
        className="max-w-3xl"
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
        <form id="form-produto" action={formAction} className="space-y-5">
          {/* Identificação */}
          <fieldset className="rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-muted">
              Identificação
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <span className="mb-1.5 block text-sm font-medium text-ink">
                  Código
                </span>
                <span className="inline-flex h-10 w-full items-center gap-2 rounded-lg bg-brand-50 px-3 text-sm font-semibold text-brand-600">
                  AUTO
                  <span className="text-xs font-normal text-muted">
                    gerado ao salvar
                  </span>
                </span>
              </div>
              <Input
                id="pr-nome"
                name="name"
                label="Nome do produto *"
                placeholder="Ex.: Dipirona Sódica"
                required
                className="sm:col-span-2"
              />
              <Input
                id="pr-principio"
                name="active_ingredient"
                label="Princípio ativo"
                placeholder="Ex.: Dipirona monoidratada"
              />
              <Input
                id="pr-apresentacao"
                name="presentation"
                label="Apresentação / Concentração"
                placeholder="Ex.: 500 mg/mL, ampola 2 mL"
              />
              <Input
                id="pr-ean"
                name="barcode"
                label="Código de barras (EAN)"
                placeholder="789..."
              />
              <Input
                id="pr-anvisa"
                name="anvisa_registration"
                label="Registro ANVISA"
                placeholder="Ex.: 1.0000.0000.000-0"
              />
            </div>
          </fieldset>

          {/* Classificação */}
          <fieldset className="rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-muted">
              Classificação
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                id="pr-categoria"
                name="category"
                label="Categoria"
                defaultValue={CATEGORIAS[0]}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
              <Input
                id="pr-classe"
                name="therapeutic_class"
                label="Classe terapêutica"
                placeholder="Ex.: Analgésico/Antitérmico"
              />
              <Select
                id="pr-unidade"
                name="unit"
                label="Unidade"
                defaultValue="unidade"
              >
                {UNIDADES.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </Select>
              <Select
                id="pr-controlado"
                name="controlled_class"
                label="Controlado / Tarja (Portaria 344)"
                defaultValue=""
                className="sm:col-span-2"
              >
                {CONTROLES.map((c) => (
                  <option key={c || "nao"} value={c}>
                    {c || "Não controlado"}
                  </option>
                ))}
              </Select>
              <Select
                id="pr-receita"
                name="requires_prescription"
                label="Exige receita?"
                defaultValue="false"
              >
                <option value="false">Não</option>
                <option value="true">Sim</option>
              </Select>
            </div>
          </fieldset>

          {/* Estoque */}
          <fieldset className="rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-muted">
              Estoque
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Input id="pr-saldo" name="quantity" label="Saldo atual" type="number" min={0} step="0.01" defaultValue={0} />
              <Input id="pr-minimo" name="min_quantity" label="Estoque mínimo" type="number" min={0} step="0.01" defaultValue={0} />
              <Input id="pr-maximo" name="max_quantity" label="Estoque máximo" type="number" min={0} step="0.01" defaultValue={0} />
              <Input id="pr-local" name="location" label="Localização" placeholder="Ex.: Prateleira A3" />
            </div>
          </fieldset>

          {/* Financeiro — restrito ao gestor */}
          <fieldset className="rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-muted">
              Financeiro
            </legend>
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
          </fieldset>

          {/* Fornecedor / Situação */}
          <fieldset className="rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-muted">
              Fornecedor e situação
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                id="pr-fabricante"
                name="manufacturer"
                label="Fabricante / Laboratório"
                placeholder="Ex.: Cristália"
              />
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
            <label htmlFor="pr-obs" className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Observações
              </span>
              <textarea
                id="pr-obs"
                name="notes"
                rows={3}
                placeholder="Informações adicionais sobre o produto..."
                className={inputTextarea}
              />
            </label>
          </fieldset>

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
