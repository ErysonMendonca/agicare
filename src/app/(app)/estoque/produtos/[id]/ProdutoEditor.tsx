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
import { FadeInUp } from "@/components/ui/Motion";
import {
  createStockProduct,
  updateStockProduct,
  deleteStockProduct,
  type ActionState,
} from "@/lib/actions/stock";
import type { AttendanceOptionsByCategory } from "@/lib/data/attendance-options.shared";
import type { ProdutoCompleto, ProdutoChildren } from "./types";

// Abas-filhas (Fael) — convenção: export function XTab({ productId, data }).
import { UnidadesTab } from "./tabs/UnidadesTab";
import { EstoqueMinMaxTab } from "./tabs/EstoqueMinMaxTab";
import { ViasAdministracaoTab } from "./tabs/ViasAdministracaoTab";
import { PrincipiosAtivosTab } from "./tabs/PrincipiosAtivosTab";
import { MarcasTab } from "./tabs/MarcasTab";
import { LocalizacoesTab } from "./tabs/LocalizacoesTab";
import { ClassificacaoXyzTab } from "./tabs/ClassificacaoXyzTab";

type TabKey =
  | "produto"
  | "unidades"
  | "minmax"
  | "vias"
  | "principios"
  | "marcas"
  | "locais"
  | "xyz";

const TABS: { key: TabKey; label: string }[] = [
  { key: "produto", label: "Produto" },
  { key: "unidades", label: "Unidade de Medida" },
  { key: "minmax", label: "Estoque Mínimo e Máximo" },
  { key: "vias", label: "Via de Administração" },
  { key: "principios", label: "Princípio Ativo" },
  { key: "marcas", label: "Marca" },
  { key: "locais", label: "Localização para Requisição" },
  { key: "xyz", label: "Classificação XYZ" },
];

export function ProdutoEditor({
  novo,
  empresa,
  produto,
  childrenData,
  options,
  gestor,
}: {
  novo: boolean;
  empresa: string;
  produto: ProdutoCompleto;
  childrenData: ProdutoChildren | null;
  options: AttendanceOptionsByCategory;
  gestor: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("produto");

  // Intenção do submit (Salvar fica; Salvar e Fechar volta à listagem).
  const intentRef = useRef<"salvar" | "fechar">("salvar");
  const [state, formAction, pending] = useActionState(
    novo ? createStockProduct : updateStockProduct,
    undefined,
  );

  // Toggle "Ativo" controlado → grava valor explícito no hidden input.
  const [ativo, setAtivo] = useState(produto.active);

  useEffect(() => {
    if (state?.ok) {
      toast.success(novo ? "Produto cadastrado!" : "Produto atualizado!");
      // Cadastro novo OU "Salvar e Fechar" → volta à lista do estoque (o produto
      // recém-criado aparece lá; para editar as seleções — unidade/via/marca/etc.
      // — abrir o produto na lista, onde as abas já ficam habilitadas).
      if (novo || intentRef.current === "fechar") {
        router.push("/estoque");
        return;
      }
      // Edição de produto existente com "Salvar" (fica): reflete os dados salvos.
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const filhasHabilitadas = !novo;

  return (
    <div className="space-y-4">
      {/* Barra de abas */}
      <div
        role="tablist"
        aria-label="Seções do produto"
        className="flex flex-wrap gap-1 border-b border-line"
      >
        {TABS.map((t) => {
          const disabled = t.key !== "produto" && !filhasHabilitadas;
          const activeTab = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={activeTab}
              disabled={disabled}
              title={
                disabled ? "Salve o produto primeiro" : undefined
              }
              onClick={() => setTab(t.key)}
              className={[
                "relative -mb-px whitespace-nowrap rounded-t-lg px-3.5 py-2.5 text-sm font-medium transition-colors",
                activeTab
                  ? "border-b-2 border-brand-500 text-brand-600"
                  : "text-muted hover:text-ink",
                disabled && "cursor-not-allowed opacity-40 hover:text-muted",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      {tab === "produto" ? (
        <ProdutoForm
          novo={novo}
          empresa={empresa}
          produto={produto}
          options={options}
          gestor={gestor}
          ativo={ativo}
          setAtivo={setAtivo}
          formAction={formAction}
          pending={pending}
          intentRef={intentRef}
          state={state}
        />
      ) : (
        <FadeInUp key={tab}>
          {tab === "unidades" && (
            <UnidadesTab
              productId={produto.id}
              data={childrenData?.units ?? []}
              options={options}
            />
          )}
          {tab === "minmax" && (
            <EstoqueMinMaxTab
              productId={produto.id}
              data={childrenData?.minMax ?? []}
            />
          )}
          {tab === "vias" && (
            <ViasAdministracaoTab
              productId={produto.id}
              data={childrenData?.routes ?? []}
              options={options}
            />
          )}
          {tab === "principios" && (
            <PrincipiosAtivosTab
              productId={produto.id}
              data={childrenData?.ingredients ?? []}
              options={options}
            />
          )}
          {tab === "marcas" && (
            <MarcasTab
              productId={produto.id}
              data={childrenData?.brands ?? []}
              options={options}
            />
          )}
          {tab === "locais" && (
            <LocalizacoesTab
              productId={produto.id}
              data={childrenData?.locations ?? []}
            />
          )}
          {tab === "xyz" && (
            <ClassificacaoXyzTab
              productId={produto.id}
              data={childrenData?.xyz ?? []}
            />
          )}
        </FadeInUp>
      )}
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
  gestor,
  ativo,
  setAtivo,
  formAction,
  pending,
  intentRef,
  state,
}: {
  novo: boolean;
  empresa: string;
  produto: ProdutoCompleto;
  options: AttendanceOptionsByCategory;
  gestor: boolean;
  ativo: boolean;
  setAtivo: (v: boolean) => void;
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
