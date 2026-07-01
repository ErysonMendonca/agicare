"use client";

import { useState, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { createStockProduct, updateStockProduct } from "@/lib/actions/stock";
import { type Fornecedor, type ProdutoEstoque } from "@/lib/data/stock";

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
 *
 * MODO EDIÇÃO: quando `produto` é informado, o modal pré-preenche os campos
 * conhecidos (os que a listagem expõe) e usa `updateStockProduct`. Nesse modo o
 * componente é CONTROLADO (open/onClose vêm do pai). No cadastro, é o próprio
 * botão "Novo Produto" que abre.
 */
export function CadastroProdutoModal({
  fornecedores,
  gestor,
  produto,
  open: openProp,
  onClose,
}: {
  fornecedores: Fornecedor[];
  gestor: boolean;
  /** Presente = modo edição (pré-preenche + updateStockProduct). */
  produto?: ProdutoEstoque;
  /** Quando definido, o modal é controlado pelo pai (usado na edição). */
  open?: boolean;
  onClose?: () => void;
}) {
  const editando = !!produto;
  const controlled = openProp !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = controlled ? openProp : openState;
  const router = useRouter();

  const [state, formAction, pending] = useActionState(
    editando ? updateStockProduct : createStockProduct,
    undefined,
  );

  const close = () => {
    if (controlled) onClose?.();
    else setOpenState(false);
  };

  useEffect(() => {
    if (state?.ok) {
      toast.success(
        editando
          ? "Produto atualizado com sucesso!"
          : "Produto cadastrado com sucesso!",
      );
      // eslint-disable-next-line react-hooks/set-state-in-effect
      close();
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router]);

  return (
    <>
      {!controlled && (
        <Button variant="primary" onClick={() => setOpenState(true)}>
          <Plus className="h-4 w-4" />
          Novo Produto
        </Button>
      )}

      <Modal
        open={open}
        onClose={close}
        title={editando ? "Editar Produto" : "Cadastro de Produto"}
        subtitle={
          editando
            ? "Atualize os dados do produto no catálogo da clínica"
            : "Cadastro completo do produto/medicamento no catálogo da clínica"
        }
        className="max-w-3xl"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" form="form-produto" disabled={pending}>
              {pending
                ? "Salvando..."
                : editando
                  ? "Salvar Alterações"
                  : "Salvar Produto"}
            </Button>
          </>
        }
      >
        <form id="form-produto" action={formAction} className="space-y-5">
          {editando && <input type="hidden" name="id" value={produto.id} />}
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
                  {editando ? (
                    produto.codigo
                  ) : (
                    <>
                      AUTO
                      <span className="text-xs font-normal text-muted">
                        gerado ao salvar
                      </span>
                    </>
                  )}
                </span>
              </div>
              <Input
                id="pr-nome"
                name="name"
                label="Nome do produto *"
                placeholder="Ex.: Dipirona Sódica"
                required
                className="sm:col-span-2"
                defaultValue={produto?.produto ?? ""}
              />
              {!editando && (
                <>
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
                  <Input
                    id="pr-ncm"
                    name="ncm"
                    label="NCM"
                    placeholder="Ex.: 3004.90.69"
                  />
                  <Input
                    id="pr-cest"
                    name="cest"
                    label="CEST"
                    placeholder="Ex.: 13.001.00"
                  />
                </>
              )}
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
                defaultValue={produto?.categoria ?? CATEGORIAS[0]}
              >
                {/* Inclui a categoria atual caso não esteja na lista padrão. */}
                {Array.from(
                  new Set([
                    ...(produto?.categoria ? [produto.categoria] : []),
                    ...CATEGORIAS,
                  ]),
                ).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
              {!editando && (
                <Input
                  id="pr-classe"
                  name="therapeutic_class"
                  label="Classe terapêutica"
                  placeholder="Ex.: Analgésico/Antitérmico"
                />
              )}
              <Select
                id="pr-unidade"
                name="unit"
                label="Unidade"
                defaultValue={produto?.unidade ?? "unidade"}
              >
                {Array.from(
                  new Set([
                    ...(produto?.unidade ? [produto.unidade] : []),
                    ...UNIDADES,
                  ]),
                ).map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </Select>
              {!editando && (
                <>
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
                </>
              )}
            </div>
          </fieldset>

          {/* Estoque */}
          <fieldset className="rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-muted">
              Estoque
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Input id="pr-saldo" name="quantity" label="Saldo atual" type="number" min={0} step="0.01" defaultValue={produto?.saldo ?? 0} />
              <Input id="pr-minimo" name="min_quantity" label="Estoque mínimo" type="number" min={0} step="0.01" defaultValue={produto?.minimo ?? 0} />
              {!editando && (
                <Input id="pr-maximo" name="max_quantity" label="Estoque máximo" type="number" min={0} step="0.01" defaultValue={0} />
              )}
              <Input id="pr-local" name="location" label="Localização" placeholder="Ex.: Prateleira A3" defaultValue={produto && produto.localizacao !== "—" ? produto.localizacao : ""} />
              <Input id="pr-lote" name="lot" label="Lote" placeholder="Ex.: ABC1234" defaultValue={produto && produto.lote !== "—" ? produto.lote : ""} />
              {!editando && (
                <Input id="pr-validade" name="expiry" label="Validade" type="date" />
              )}
            </div>
          </fieldset>

          {/* Financeiro — restrito ao gestor */}
          <fieldset className="rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-muted">
              Financeiro
            </legend>
            {gestor ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input id="pr-custo" name="cost" label="Custo unitário (R$)" type="number" min={0} step="0.01" defaultValue={produto?.custo ?? 0} />
                <Input id="pr-preco" name="price" label="Preço de venda (R$)" type="number" min={0} step="0.01" defaultValue={produto?.preco ?? 0} />
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
              {editando ? "Situação" : "Fornecedor e situação"}
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {!editando && (
                <>
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
                </>
              )}
              <Select
                id="pr-ativo"
                name="active"
                label="Situação"
                defaultValue={
                  produto ? (produto.ativo ? "true" : "false") : "true"
                }
              >
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </Select>
            </div>
            {!editando && (
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
            )}
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
