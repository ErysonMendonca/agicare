"use client";

import {
  useState,
  useRef,
  useEffect,
  useActionState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import { Lock, Trash2, Check as CheckIcon, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import {
  createStockProduct,
  updateStockProduct,
  deleteStockProduct,
  type ActionState,
} from "@/lib/actions/stock";
import {
  setProdutoSelecoes,
  addProductXyz,
  removeProductXyz,
} from "@/lib/actions/stock-product-children";
import type { AttendanceOptionsByCategory } from "@/lib/data/attendance-options.shared";
import type { ProdutoCatalogos } from "@/lib/data/produto-catalogos";
import type {
  ProdutoCompleto,
  ProdutoChildren,
  ProductXyzClass,
} from "./types";

export function ProdutoEditor({
  novo,
  empresa,
  produto,
  childrenData,
  options,
  catalogos,
  gestor,
}: {
  novo: boolean;
  empresa: string;
  produto: ProdutoCompleto;
  childrenData: ProdutoChildren | null;
  options: AttendanceOptionsByCategory;
  catalogos: ProdutoCatalogos;
  gestor: boolean;
}) {
  const router = useRouter();

  // Intenção do submit (Salvar fica; Salvar e Fechar volta à listagem).
  const intentRef = useRef<"salvar" | "fechar">("salvar");
  const [state, formAction, pending] = useActionState(
    novo ? createStockProduct : updateStockProduct,
    undefined,
  );

  // Toggle "Ativo" controlado → grava valor explícito no hidden input.
  const [ativo, setAtivo] = useState(produto.active);

  // ── Multi-seleções (rótulos escolhidos dos catálogos) ──────────────
  const [selUnidades, setSelUnidades] = useState<string[]>(
    () => (childrenData?.units ?? []).map((u) => u.unitLabel),
  );
  const [selVias, setSelVias] = useState<string[]>(
    () => (childrenData?.routes ?? []).map((r) => r.routeLabel),
  );
  const [selPrincipios, setSelPrincipios] = useState<string[]>(
    () => (childrenData?.ingredients ?? []).map((i) => i.ingredientLabel),
  );
  const [selMarcas, setSelMarcas] = useState<string[]>(
    () => (childrenData?.brands ?? []).map((b) => b.brandLabel),
  );
  const [selLocais, setSelLocais] = useState<string[]>(
    () => (childrenData?.locations ?? []).map((l) => l.locationLabel),
  );

  // Classificação XYZ (seleção simples) — usa a filha ativa existente.
  const xyzInicial =
    (childrenData?.xyz ?? []).find((x) => x.active)?.xyzClass ??
    (childrenData?.xyz ?? [])[0]?.xyzClass ??
    "";
  const [selXyz, setSelXyz] = useState<ProductXyzClass | "">(xyzInicial);

  // Transição para persistir as seleções após salvar o produto.
  const [savingSel, startSaveSel] = useTransition();

  // Sincroniza as filhas de rótulo + a classificação XYZ do produto salvo.
  async function persistSelecoes(id: string): Promise<boolean> {
    const res = await setProdutoSelecoes(id, {
      unidades: selUnidades,
      vias: selVias,
      principios: selPrincipios,
      marcas: selMarcas,
      localizacoes: selLocais,
    });
    if (!res.ok) {
      toast.error(res.error ?? "Não foi possível salvar as seleções.");
      return false;
    }
    // XYZ: só mexe se mudou. Remove as classificações existentes e (re)adiciona.
    if (selXyz !== xyzInicial) {
      for (const x of childrenData?.xyz ?? []) {
        await removeProductXyz(x.id, id);
      }
      if (selXyz) {
        // Deriva a classe (X/Y/Z) da 1ª letra do rótulo do catálogo — robusto a
        // rótulos renomeados (ex.: "X - Crítico") que o enum da action rejeitaria.
        const xyzClass = selXyz.trim().charAt(0).toUpperCase();
        if (xyzClass === "X" || xyzClass === "Y" || xyzClass === "Z") {
          await addProductXyz({ productId: id, xyzClass });
        }
      }
    }
    return true;
  }

  useEffect(() => {
    if (state?.ok) {
      const id = novo ? state.id : produto.id;
      if (!id) {
        toast.error("Produto salvo, mas não foi possível obter o código.");
        return;
      }
      startSaveSel(async () => {
        const ok = await persistSelecoes(id);
        toast.success(novo ? "Produto cadastrado!" : "Produto atualizado!");
        // Fluxo padrão: salvar produto → seleções → lista do estoque.
        // "Salvar" (fica) numa edição só recarrega para refletir os dados.
        if (novo || intentRef.current === "fechar" || !ok) {
          router.push("/estoque");
          return;
        }
        router.refresh();
      });
    } else if (state?.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="space-y-4">
      <ProdutoForm
        novo={novo}
        empresa={empresa}
        produto={produto}
        options={options}
        catalogos={catalogos}
        gestor={gestor}
        ativo={ativo}
        setAtivo={setAtivo}
        selUnidades={selUnidades}
        setSelUnidades={setSelUnidades}
        selVias={selVias}
        setSelVias={setSelVias}
        selPrincipios={selPrincipios}
        setSelPrincipios={setSelPrincipios}
        selMarcas={selMarcas}
        setSelMarcas={setSelMarcas}
        selLocais={selLocais}
        setSelLocais={setSelLocais}
        selXyz={selXyz}
        setSelXyz={setSelXyz}
        formAction={formAction}
        pending={pending || savingSel}
        intentRef={intentRef}
        state={state}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Aba PRODUTO — formulário completo (form action → create/update)
// ════════════════════════════════════════════════════════════════
function ProdutoForm({
  novo,
  empresa,
  produto,
  options,
  catalogos,
  gestor,
  ativo,
  setAtivo,
  selUnidades,
  setSelUnidades,
  selVias,
  setSelVias,
  selPrincipios,
  setSelPrincipios,
  selMarcas,
  setSelMarcas,
  selLocais,
  setSelLocais,
  selXyz,
  setSelXyz,
  formAction,
  pending,
  intentRef,
  state,
}: {
  novo: boolean;
  empresa: string;
  produto: ProdutoCompleto;
  options: AttendanceOptionsByCategory;
  catalogos: ProdutoCatalogos;
  gestor: boolean;
  ativo: boolean;
  setAtivo: (v: boolean) => void;
  selUnidades: string[];
  setSelUnidades: (v: string[]) => void;
  selVias: string[];
  setSelVias: (v: string[]) => void;
  selPrincipios: string[];
  setSelPrincipios: (v: string[]) => void;
  selMarcas: string[];
  setSelMarcas: (v: string[]) => void;
  selLocais: string[];
  setSelLocais: (v: string[]) => void;
  selXyz: ProductXyzClass | "";
  setSelXyz: (v: ProductXyzClass | "") => void;
  formAction: (fd: FormData) => void;
  pending: boolean;
  intentRef: RefObject<"salvar" | "fechar">;
  state: ActionState;
}) {
  const router = useRouter();
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, startDelete] = useTransition();

  const tipos = options["tipo_produto"] ?? [];
  const grupos = options["grupo_produto"] ?? [];

  // Opções ATIVAS dos catálogos (rótulos) para cada multi-seleção.
  const optUnidades = activeLabels(catalogos.unidade_medida, selUnidades);
  const optVias = activeLabels(catalogos.via_administracao, selVias);
  const optPrincipios = activeLabels(catalogos.principio_ativo, selPrincipios);
  const optMarcas = activeLabels(catalogos.marca, selMarcas);
  const optLocais = activeLabels(catalogos.localizacao, selLocais);
  const optXyz = catalogos.classificacao_xyz.filter((o) => o.active);

  function excluir() {
    startDelete(async () => {
      const res = await deleteStockProduct(produto.id);
      if (res?.ok) {
        toast.success("Produto excluído.");
        router.push("/estoque");
      } else {
        toast.error(res?.error ?? "Falha ao excluir.");
        setConfirmDel(false);
      }
    });
  }

  return (
    <>
      <form id="form-produto" action={formAction} className="space-y-4">
        {!novo && <input type="hidden" name="id" value={produto.id} />}
        {/* Ativo: valor explícito (o toggle é controlado). */}
        <input type="hidden" name="active" value={ativo ? "true" : "false"} />

        {/* Identificação */}
        <Card className="p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Empresa
              </span>
              <span className="flex h-10 w-full items-center rounded-lg border border-line bg-muted-surface px-3 text-sm text-muted">
                {empresa}
              </span>
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Código
              </span>
              <span className="inline-flex h-10 w-full items-center gap-2 rounded-lg bg-brand-50 px-3 text-sm font-semibold text-brand-600">
                {novo ? (
                  <>
                    AUTO
                    <span className="text-xs font-normal text-muted">
                      gerado ao salvar
                    </span>
                  </>
                ) : (
                  produto.codigo || "—"
                )}
              </span>
            </div>
            <div className="flex items-end">
              <Toggle
                label="Ativo"
                checked={ativo}
                onChange={setAtivo}
              />
            </div>
            <Input
              id="pr-nome"
              name="name"
              label="Descrição *"
              placeholder="Ex.: Dipirona Sódica 500mg/mL"
              required
              defaultValue={produto.name}
              className="sm:col-span-2 lg:col-span-3"
            />
          </div>
        </Card>

        {/* Classificação */}
        <Card className="p-5">
          <SectionTitle>Classificação</SectionTitle>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select
              id="pr-tipo"
              name="product_type"
              label="Tipo de Produto"
              defaultValue={produto.productType ?? ""}
            >
              <option value="">Selecione</option>
              {optionList(tipos, produto.productType ?? "")}
            </Select>
            <Select
              id="pr-grupo"
              name="product_group"
              label="Grupo"
              defaultValue={produto.productGroup ?? ""}
            >
              <option value="">Selecione</option>
              {optionList(grupos, produto.productGroup ?? "")}
            </Select>
            <Input
              id="pr-classif"
              name="classification"
              label="Classificação"
              defaultValue={produto.classification ?? ""}
            />
            <Input
              id="pr-subclassif"
              name="subclassification"
              label="Subclassificação"
              defaultValue={produto.subclassification ?? ""}
            />
            <Input
              id="pr-ncm"
              name="ncm"
              label="NCM"
              placeholder="Ex.: 3004.90.69"
              defaultValue={produto.ncm ?? ""}
            />
            <Input
              id="pr-cfop"
              name="cfop"
              label="CFOP"
              placeholder="Ex.: 5405"
              defaultValue={produto.cfop ?? ""}
            />
            <div className="flex items-end sm:col-span-2 lg:col-span-1">
              <Checkbox
                name="port_344"
                label="Port. 344/98"
                defaultChecked={produto.port344}
              />
            </div>
          </div>
        </Card>

        {/* Controle */}
        <Card className="p-5">
          <SectionTitle>Controle</SectionTitle>
          <CheckGrid>
            <Checkbox name="ctrl_lote_validade" label="Lote e Validade" defaultChecked={produto.ctrlLoteValidade} />
            <Checkbox name="ctrl_opme" label="OPME" defaultChecked={produto.ctrlOpme} />
            <Checkbox name="ctrl_numero_serie" label="Número Série" defaultChecked={produto.ctrlNumeroSerie} />
            <Checkbox name="ctrl_marca" label="Marca" defaultChecked={produto.ctrlMarca} />
          </CheckGrid>
        </Card>

        {/* Prescrição Médica */}
        <Card className="p-5">
          <SectionTitle>Prescrição Médica</SectionTitle>
          <CheckGrid>
            <Checkbox name="presc_qualquer_via" label="Qualquer Via de Administração" defaultChecked={produto.prescQualquerVia} />
            <Checkbox name="presc_qualquer_frequencia" label="Qualquer Frequência" defaultChecked={produto.prescQualquerFrequencia} />
            <Checkbox name='presc_se_necessario' label='Prescrito "Se Necessário"' defaultChecked={produto.prescSeNecessario} />
          </CheckGrid>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              id="pr-solicita"
              name="solicita_se_necessario"
              label="Solicita Se Necessário"
              defaultValue={produto.solicitaSeNecessario ?? "NAO SOLICITA"}
            >
              <option value="NAO SOLICITA">NÃO SOLICITA</option>
              <option value="SOLICITA">SOLICITA</option>
            </Select>
            <Select
              id="pr-sal"
              name="sal_principio_ativo"
              label="Sal/Princípio Ativo"
              defaultValue={produto.salPrincipioAtivo ?? "NAO SUBSTITUI"}
            >
              <option value="NAO SUBSTITUI">NÃO SUBSTITUI</option>
              <option value="SUBSTITUI">SUBSTITUI</option>
            </Select>
          </div>
        </Card>

        {/* Outras Informações */}
        <Card className="p-5">
          <SectionTitle>Outras Informações</SectionTitle>
          <CheckGrid>
            <Checkbox name="info_alto_custo" label="Alto Custo" defaultChecked={produto.infoAltoCusto} />
            <Checkbox name="info_alto_risco" label="Alto Risco" defaultChecked={produto.infoAltoRisco} />
            <Checkbox name="info_urgencia" label="Urgência" defaultChecked={produto.infoUrgencia} />
            <Checkbox name="info_oncologia" label="Oncologia" defaultChecked={produto.infoOncologia} />
            <Checkbox name="info_antimicrobiano_restrito" label="Antimicrobiano de Uso Restrito" defaultChecked={produto.infoAntimicrobianoRestrito} />
            <Checkbox name="info_dva" label="Droga Vasoativa (DVA)" defaultChecked={produto.infoDva} />
            <Checkbox name="info_uso_continuo" label="Medicamento de Uso Contínuo" defaultChecked={produto.infoUsoContinuo} />
            <Checkbox name="info_nao_padrao" label="Não Padrão" defaultChecked={produto.infoNaoPadrao} />
          </CheckGrid>
        </Card>

        {/* Solução Composta */}
        <Card className="p-5">
          <SectionTitle>Solução Composta</SectionTitle>
          <CheckGrid>
            <Checkbox name="sol_componente_diluido" label="Componente Diluído" defaultChecked={produto.solComponenteDiluido} />
            <Checkbox name="sol_componente_diluente" label="Componente Diluente" defaultChecked={produto.solComponenteDiluente} />
          </CheckGrid>
          {!gestor && (
            <p className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-muted-surface px-3 py-2 text-xs text-muted">
              <Lock className="h-3.5 w-3.5" />
              Custo e preço são editados por um gestor.
            </p>
          )}
        </Card>

        {/* Estoque Mínimo e Máximo (campos do próprio produto) */}
        <Card className="p-5">
          <SectionTitle>Estoque Mínimo e Máximo</SectionTitle>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              id="pr-min"
              name="min_quantity"
              type="number"
              min={0}
              step="any"
              label="Estoque Mínimo"
              defaultValue={String(produto.minQuantity ?? 0)}
            />
            <Input
              id="pr-max"
              name="max_quantity"
              type="number"
              min={0}
              step="any"
              label="Estoque Máximo"
              defaultValue={String(produto.maxQuantity ?? 0)}
            />
          </div>
        </Card>

        {/* Seleções (multi-seleção a partir dos catálogos de Configurações) */}
        <Card className="p-5">
          <SectionTitle>Seleções</SectionTitle>
          <p className="-mt-2 mb-4 text-xs text-muted">
            Marque os itens que se aplicam a este produto. As opções são geridas
            nos catálogos em Configurações.
          </p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            <CheckboxGroup
              legend="Unidade de Medida"
              options={optUnidades}
              selected={selUnidades}
              onChange={setSelUnidades}
            />
            <CheckboxGroup
              legend="Via de Administração"
              options={optVias}
              selected={selVias}
              onChange={setSelVias}
            />
            <CheckboxGroup
              legend="Princípio Ativo"
              options={optPrincipios}
              selected={selPrincipios}
              onChange={setSelPrincipios}
            />
            <CheckboxGroup
              legend="Marca"
              options={optMarcas}
              selected={selMarcas}
              onChange={setSelMarcas}
            />
            <CheckboxGroup
              legend="Localização para Requisição"
              options={optLocais}
              selected={selLocais}
              onChange={setSelLocais}
            />
            <div>
              <Select
                id="pr-xyz"
                label="Classificação XYZ"
                value={selXyz}
                onChange={(e) =>
                  setSelXyz(e.target.value as ProductXyzClass | "")
                }
              >
                <option value="">Sem classificação</option>
                {optXyz.map((o) => (
                  <option key={o.id} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </Card>

        {state?.error && (
          <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {state.error}
          </p>
        )}
      </form>

      {/* Rodapé de ações */}
      <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-[var(--shadow-card)] backdrop-blur">
        <div>
          {!novo && (
            <Button
              type="button"
              variant="danger"
              disabled={deleting}
              onClick={() => setConfirmDel(true)}
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            form="form-produto"
            variant="outline"
            disabled={pending}
            onClick={() => (intentRef.current = "salvar")}
          >
            {pending ? "Salvando..." : "Salvar"}
          </Button>
          <Button
            type="submit"
            form="form-produto"
            disabled={pending}
            onClick={() => (intentRef.current = "fechar")}
          >
            Salvar e Fechar
          </Button>
        </div>
      </div>

      <Modal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Excluir produto"
        subtitle="Esta ação não pode ser desfeita."
        className="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDel(false)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={deleting} onClick={excluir}>
              {deleting ? "Excluindo..." : "Excluir"}
            </Button>
          </>
        }
      >
        <p className="flex items-start gap-2 text-sm text-ink">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-danger" />
          Excluir <strong>{produto.name}</strong> e todos os seus dados
          vinculados (unidades, marcas, princípios ativos, etc.)?
        </p>
      </Modal>
    </>
  );
}

// ── Auxiliares de UI ────────────────────────────────────────────────
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-4 text-sm font-semibold text-muted">{children}</h2>
  );
}

function CheckGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

/**
 * Rótulos ATIVOS do catálogo + quaisquer rótulos já selecionados que não estejam
 * mais ativos (legado) — para que o usuário continue vendo/mantendo o que o
 * produto já tinha. Ordenados como vieram do catálogo; extras ao final.
 */
function activeLabels(
  items: { id: string; label: string; active: boolean }[],
  selected: string[],
): string[] {
  const ativos = items.filter((i) => i.active).map((i) => i.label);
  const set = new Set(ativos.map((l) => l.toLowerCase()));
  const extras = selected.filter((l) => !set.has(l.toLowerCase()));
  return [...ativos, ...extras];
}

/** Lista de checkboxes (multi-seleção controlada) para uma categoria. */
function CheckboxGroup({
  legend,
  options,
  selected,
  onChange,
}: {
  legend: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(label: string, checked: boolean) {
    if (checked) {
      if (!selected.some((s) => s.toLowerCase() === label.toLowerCase())) {
        onChange([...selected, label]);
      }
    } else {
      onChange(selected.filter((s) => s.toLowerCase() !== label.toLowerCase()));
    }
  }

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium text-ink">{legend}</legend>
      {options.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted">
          Nenhuma opção cadastrada em Configurações.
        </p>
      ) : (
        <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
          {options.map((label) => {
            const checked = selected.some(
              (s) => s.toLowerCase() === label.toLowerCase(),
            );
            return (
              <label
                key={label}
                className="flex cursor-pointer items-center gap-2 text-sm text-ink"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggle(label, e.target.checked)}
                  className="h-4 w-4 rounded border-line text-brand-500 accent-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                {label}
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

function optionList(
  opts: { id: string; label: string; value: string }[],
  current: string,
) {
  const values = new Set(opts.map((o) => o.value));
  const extra =
    current && !values.has(current)
      ? [{ id: `cur-${current}`, label: current, value: current }]
      : [];
  return [...extra, ...opts].map((o) => (
    <option key={o.id} value={o.value}>
      {o.label}
    </option>
  ));
}

/** Checkbox de formulário (envia value="true" quando marcado). */
function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
      {/* Companion: checkbox desmarcado não vai no FormData. O hidden "false"
          garante que k∈raw sempre (senão o update pula o campo e o uncheck
          — true→false — é perdido silenciosamente). Marcado: o "true" vence. */}
      <input type="hidden" name={name} value="false" />
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-line text-brand-500 accent-brand-500 focus:ring-2 focus:ring-brand-100"
      />
      {label}
    </label>
  );
}

/** Toggle controlado (acessível) — usado no campo "Ativo". */
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={[
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1",
          checked ? "bg-brand-500" : "bg-line",
        ].join(" ")}
      >
        <span
          className={[
            "inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          ].join(" ")}
        >
          {checked && <CheckIcon className="h-3 w-3 text-brand-500" />}
        </span>
      </button>
      <span className="text-sm font-medium text-ink">{label}</span>
    </div>
  );
}
