"use client";

import {
  useState,
  useActionState,
  useEffect,
  useMemo,
  useId,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Tag,
  Clock,
  Boxes,
  Layers,
  FileText,
  DollarSign,
  Pencil,
  Trash2,
  Copy,
  PlayCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import {
  createProcedure,
  updateProcedure,
  deleteProcedure,
  duplicateProcedure,
  registrarExecucao,
} from "@/lib/actions/procedures";

type ProfOption = { id: string; nome: string; especialidade: string };
type InsumoOption = { id: string; nome: string; unidade: string };

/** Vínculos pré-existentes (abas B/C/E) para pré-preencher a edição. */
export type ProcedureRelations = {
  professionalIds: string[];
  materialIds: string[];
  materialQty: Record<string, number>;
  preInstructions: string;
  postInstructions: string;
  requireConsent: boolean;
  requireAnamnese: boolean;
  /** Canal das orientações (e-mail/SMS/ambos). Opcional p/ pré-preenchimento. */
  channel?: "email" | "sms" | "ambos";
};

/** Linha bruta de procedimento (para pré-preencher a edição). */
export type ProcedureRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  commercial_desc: string | null;
  duration_min: number | null;
  setup_min: number | null;
  cleanup_min: number | null;
  sessions: number | null;
  session_validity_days: number | null;
  min_age: number | null;
  audience: string | null;
  price: number | null;
  cost: number | null;
  commission_pct: number | null;
  tax_pct: number | null;
  margin_pct: number | null;
  active: boolean;
};

const ABAS = [
  { id: "identificacao", label: "Identificação", icon: Tag },
  { id: "tempo", label: "Tempo e Agenda", icon: Clock },
  { id: "materiais", label: "Materiais", icon: Boxes },
  { id: "sessoes", label: "Sessões", icon: Layers },
  { id: "orientacoes", label: "Orientações", icon: FileText },
  { id: "financeiro", label: "Financeiro", icon: DollarSign },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

/** Formata número para moeda brasileira (R$ pt-BR). */
const moedaBR = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Lê string "12,5"/"12.5" como número (0 se vazio). */
const num = (v: string) => (v ? Number(v.replace(",", ".")) || 0 : 0);

/** Pré-valor de campo numérico controlado (vazio quando 0/nulo). */
const numField = (n: number | null | undefined) =>
  n == null || n === 0 ? "" : String(n);

/**
 * Modal de procedimento em 6 abas (gestor-only), compartilhado entre cadastro
 * e edição. Sem `procedure` → modo criar (createProcedure); com `procedure` →
 * modo editar (updateProcedure pré-preenchido). No modo demo, simula sucesso.
 *
 * É controlado por `open`/`onClose`. O pai deve montá-lo com `key` único por
 * procedimento para que os campos controlados reiniciem a cada abertura.
 */
function ProcedimentoFormModal({
  open,
  onClose,
  profissionais,
  insumos,
  procedure,
  relations,
}: {
  open: boolean;
  onClose: () => void;
  profissionais: ProfOption[];
  insumos: InsumoOption[];
  procedure?: ProcedureRow;
  relations?: ProcedureRelations;
}) {
  const isEdit = !!procedure;
  const formId = useId();
  const action = procedure
    ? updateProcedure.bind(null, procedure.id)
    : createProcedure;
  const [state, formAction, pending] = useActionState(action, undefined);
  const [aba, setAba] = useState<AbaId>("identificacao");
  const router = useRouter();

  // Tempos (aba B) → bloqueio total da agenda.
  const [execucao, setExecucao] = useState(numField(procedure?.duration_min));
  const [setup, setSetup] = useState(numField(procedure?.setup_min));
  const [limpeza, setLimpeza] = useState(numField(procedure?.cleanup_min));
  const bloqueioTotal = num(execucao) + num(setup) + num(limpeza);

  // Financeiro (aba F) → lucro líquido e margem em tempo real.
  const [preco, setPreco] = useState(numField(procedure?.price));
  const [custo, setCusto] = useState(numField(procedure?.cost));
  const [comissao, setComissao] = useState(numField(procedure?.commission_pct));
  const [imposto, setImposto] = useState(numField(procedure?.tax_pct));

  const { lucro, margem } = useMemo(() => {
    const p = num(preco);
    const comissaoValor = (p * num(comissao)) / 100;
    const impostoValor = (p * num(imposto)) / 100;
    const l = p - num(custo) - comissaoValor - impostoValor;
    return { lucro: l, margem: p > 0 ? Math.round((l / p) * 100) : 0 };
  }, [preco, custo, comissao, imposto]);

  useEffect(() => {
    if (state?.ok) {
      toast.success(
        isEdit
          ? "Procedimento atualizado com sucesso!"
          : "Procedimento cadastrado com sucesso!",
      );
      onClose();
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, isEdit, onClose, router]);

  const categoriaDefault = procedure?.category ?? "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar Procedimento" : "Novo Procedimento"}
      subtitle={
        isEdit
          ? "Atualize os dados do procedimento"
          : "Cadastro completo em 6 etapas"
      }
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending
              ? "Salvando..."
              : isEdit
                ? "Salvar Alterações"
                : "Salvar Procedimento"}
          </Button>
        </>
      }
    >
        {/* Navegação por abas */}
        <div className="mb-5 flex flex-wrap gap-1.5">
          {ABAS.map((a) => {
            const Icon = a.icon;
            const ativa = aba === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAba(a.id)}
                className={
                  ativa
                    ? "inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white"
                    : "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:bg-black/5 hover:text-ink"
                }
              >
                <Icon className="h-3.5 w-3.5" /> {a.label}
              </button>
            );
          })}
        </div>

        <form id={formId} action={formAction} className="space-y-4">
          {/* Aba A — Identificação */}
          <div className={aba === "identificacao" ? "space-y-4" : "hidden"}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {isEdit ? (
                <Input
                  id="pc-code"
                  name="code"
                  label="Código"
                  defaultValue={procedure?.code ?? ""}
                  placeholder="PROC-00001"
                  required
                />
              ) : (
                // Criação: o SKU é gerado no servidor (sequencial por clínica).
                // Campo somente-leitura e SEM name (não é enviado no form).
                <Input
                  id="pc-code"
                  label="Código"
                  value="Gerado automaticamente"
                  readOnly
                  disabled
                  className="text-muted"
                />
              )}
              <Select
                id="pc-cat"
                name="category"
                label="Categoria"
                defaultValue={categoriaDefault}
              >
                <option value="" disabled>
                  Selecione
                </option>
                {["Facial", "Corporal", "Injetáveis", "Capilar", "Clínico"].map(
                  (c) => (
                    <option key={c}>{c}</option>
                  ),
                )}
              </Select>
            </div>
            <Input
              id="pc-name"
              name="name"
              label="Nome do procedimento"
              defaultValue={procedure?.name ?? ""}
              placeholder="Ex.: Limpeza de Pele Profunda"
              required
            />
            <label htmlFor="pc-desc" className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Descrição técnica
              </span>
              <textarea
                id="pc-desc"
                name="description"
                rows={2}
                defaultValue={procedure?.description ?? ""}
                placeholder="Descrição interna / técnica do procedimento"
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <label htmlFor="pc-comm" className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Descrição comercial
              </span>
              <textarea
                id="pc-comm"
                name="commercial_desc"
                rows={2}
                defaultValue={procedure?.commercial_desc ?? ""}
                placeholder="Texto voltado ao paciente (marketing / orçamento)"
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>
          </div>

          {/* Aba B — Tempo e Agenda */}
          <div className={aba === "tempo" ? "space-y-4" : "hidden"}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                id="pc-exec"
                name="duration_min"
                label="Execução (min)"
                type="number"
                min={0}
                value={execucao}
                onChange={(e) => setExecucao(e.target.value)}
              />
              <Input
                id="pc-setup"
                name="setup_min"
                label="Setup / preparo (min)"
                type="number"
                min={0}
                value={setup}
                onChange={(e) => setSetup(e.target.value)}
              />
              <Input
                id="pc-clean"
                name="cleanup_min"
                label="Limpeza (min)"
                type="number"
                min={0}
                value={limpeza}
                onChange={(e) => setLimpeza(e.target.value)}
              />
            </div>
            <div className="rounded-xl border border-line bg-muted-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">
                  Bloqueio total na agenda
                </span>
                <span className="text-lg font-bold text-ink">
                  {bloqueioTotal} min
                </span>
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Profissionais habilitados
              </span>
              {profissionais.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">
                  Nenhum profissional cadastrado.
                </p>
              ) : (
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
                  {profissionais.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2.5 text-sm text-ink"
                    >
                      <input
                        type="checkbox"
                        name="professional_ids"
                        value={p.id}
                        defaultChecked={relations?.professionalIds.includes(
                          p.id,
                        )}
                        className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-100"
                      />
                      <span>{p.nome}</span>
                      <span className="text-xs text-muted">
                        {p.especialidade}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Aba C — Materiais */}
          <div className={aba === "materiais" ? "space-y-4" : "hidden"}>
            <p className="text-sm text-muted">
              Selecione os insumos consumidos. A baixa no estoque é automática a
              cada execução.
            </p>
            {insumos.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">
                Nenhum insumo no estoque.
              </p>
            ) : (
              <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
                {insumos.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center gap-2.5 text-sm text-ink"
                  >
                    <label className="flex flex-1 items-center gap-2.5">
                      <input
                        type="checkbox"
                        name="material_ids"
                        value={i.id}
                        defaultChecked={relations?.materialIds.includes(i.id)}
                        className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-100"
                      />
                      <span className="flex-1">{i.nome}</span>
                      <span className="text-xs text-muted">{i.unidade}</span>
                    </label>
                    <input
                      type="number"
                      name={`material_qty_${i.id}`}
                      aria-label={`Quantidade por execução — ${i.nome}`}
                      min={0}
                      step="0.01"
                      defaultValue={relations?.materialQty[i.id] ?? 1}
                      className="h-8 w-20 rounded-lg border border-line bg-white px-2 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Aba D — Sessões */}
          <div className={aba === "sessoes" ? "space-y-4" : "hidden"}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="pc-sessions"
                name="sessions"
                label="Sessões no pacote"
                type="number"
                min={1}
                defaultValue={procedure?.sessions ?? 1}
              />
              <Input
                id="pc-validade"
                name="session_validity_days"
                label="Validade do pacote (dias)"
                type="number"
                min={0}
                defaultValue={numField(procedure?.session_validity_days)}
                placeholder="180"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="pc-idade"
                name="min_age"
                label="Idade mínima"
                type="number"
                min={0}
                defaultValue={numField(procedure?.min_age)}
                placeholder="18"
              />
              <Select
                id="pc-publico"
                name="audience"
                label="Público"
                defaultValue={procedure?.audience ?? "todos"}
              >
                <option value="todos">Todos</option>
                <option value="adulto">Adulto</option>
                <option value="infantil">Infantil</option>
                <option value="idoso">Idoso</option>
              </Select>
            </div>
          </div>

          {/* Aba E — Orientações e Documentos */}
          <div className={aba === "orientacoes" ? "space-y-4" : "hidden"}>
            <label htmlFor="pc-pre" className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Orientações pré-procedimento
              </span>
              <textarea
                id="pc-pre"
                name="pre_instructions"
                rows={2}
                defaultValue={relations?.preInstructions ?? ""}
                placeholder="Ex.: suspender ácidos 7 dias antes"
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <label htmlFor="pc-pos" className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Orientações pós-procedimento
              </span>
              <textarea
                id="pc-pos"
                name="post_instructions"
                rows={2}
                defaultValue={relations?.postInstructions ?? ""}
                placeholder="Ex.: evitar sol por 48h"
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <div className="space-y-2 rounded-lg border border-line p-3">
              <label className="flex items-center gap-2.5 text-sm text-ink">
                <input
                  type="checkbox"
                  name="require_consent"
                  defaultChecked={relations?.requireConsent}
                  className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-100"
                />
                Exigir termo de consentimento
              </label>
              <label className="flex items-center gap-2.5 text-sm text-ink">
                <input
                  type="checkbox"
                  name="require_anamnese"
                  defaultChecked={relations?.requireAnamnese}
                  className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-100"
                />
                Exigir anamnese prévia
              </label>
            </div>
            <Select
              id="pc-channel"
              name="instructions_channel"
              label="Canal de envio das orientações"
              defaultValue={relations?.channel ?? "email"}
            >
              <option value="email">E-mail</option>
              <option value="sms">SMS</option>
              <option value="ambos">E-mail e SMS</option>
            </Select>
            <p className="-mt-2 text-xs text-muted">
              Define como as orientações pré/pós são enviadas ao paciente.
            </p>
          </div>

          {/* Aba F — Financeiro */}
          <div className={aba === "financeiro" ? "space-y-4" : "hidden"}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="pc-price"
                name="price"
                label="Preço de venda (R$)"
                inputMode="decimal"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                placeholder="250,00"
              />
              <Input
                id="pc-cost"
                name="cost"
                label="Custo direto (R$)"
                inputMode="decimal"
                value={custo}
                onChange={(e) => setCusto(e.target.value)}
                placeholder="90,00"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="pc-comm-pct"
                name="commission_pct"
                label="Comissão (%)"
                inputMode="decimal"
                value={comissao}
                onChange={(e) => setComissao(e.target.value)}
                placeholder="10"
              />
              <Input
                id="pc-tax-pct"
                name="tax_pct"
                label="Impostos (%)"
                inputMode="decimal"
                value={imposto}
                onChange={(e) => setImposto(e.target.value)}
                placeholder="6"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-muted-surface p-4">
                <div className="text-xs text-muted">Lucro líquido</div>
                <div
                  className={
                    lucro >= 0
                      ? "mt-1 text-lg font-bold text-green-600"
                      : "mt-1 text-lg font-bold text-red-600"
                  }
                >
                  {moedaBR(lucro)}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-muted-surface p-4">
                <div className="text-xs text-muted">Margem</div>
                <div
                  className={
                    margem >= 0
                      ? "mt-1 text-lg font-bold text-ink"
                      : "mt-1 text-lg font-bold text-red-600"
                  }
                >
                  {margem}%
                </div>
              </div>
            </div>
          </div>

          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {state.error}
            </p>
          )}
        </form>
      </Modal>
  );
}

/**
 * Botão "Novo Procedimento" + modal de cadastro (gestor-only). Wrapper de
 * conveniência sobre ProcedimentoFormModal em modo criação.
 */
export function NovoProcedimentoModal({
  profissionais,
  insumos,
}: {
  profissionais: ProfOption[];
  insumos: InsumoOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Novo Procedimento
      </Button>

      {/* key remonta o form a cada abertura → campos limpos. */}
      {open && (
        <ProcedimentoFormModal
          key={open ? "novo-aberto" : "novo-fechado"}
          open={open}
          onClose={() => setOpen(false)}
          profissionais={profissionais}
          insumos={insumos}
        />
      )}
    </>
  );
}

/**
 * Ações por linha da tabela de procedimentos (gestor-only): Editar (abre o
 * mesmo modal pré-preenchido) e Excluir (confirmação → soft-delete).
 */
export function ProcedimentoAcoes({
  procedure,
  profissionais,
  insumos,
  relations,
}: {
  procedure: ProcedureRow;
  profissionais: ProfOption[];
  insumos: InsumoOption[];
  relations?: ProcedureRelations;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteProcedure(procedure.id);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Procedimento removido.");
      setConfirmOpen(false);
      router.refresh();
    });
  }

  function handleDuplicate() {
    startTransition(async () => {
      const res = await duplicateProcedure(procedure.id);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Procedimento duplicado.");
      router.refresh();
    });
  }

  function handleExecucao() {
    startTransition(async () => {
      const res = await registrarExecucao(procedure.id);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Execução registrada — baixa de estoque aplicada.");
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1 text-muted">
        <button
          type="button"
          aria-label="Registrar execução (baixa de estoque)"
          onClick={handleExecucao}
          disabled={pending}
          className="rounded-md p-1.5 hover:bg-green-50 hover:text-green-600 disabled:opacity-50"
        >
          <PlayCircle className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Duplicar"
          onClick={handleDuplicate}
          disabled={pending}
          className="rounded-md p-1.5 hover:bg-black/5 hover:text-ink disabled:opacity-50"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Editar"
          onClick={() => setEditOpen(true)}
          className="rounded-md p-1.5 hover:bg-black/5 hover:text-ink"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Excluir"
          onClick={() => setConfirmOpen(true)}
          className="rounded-md p-1.5 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Modal de edição (montado só quando aberto → campos pré-preenchidos). */}
      {editOpen && (
        <ProcedimentoFormModal
          key={procedure.id}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          profissionais={profissionais}
          insumos={insumos}
          procedure={procedure}
          relations={relations}
        />
      )}

      {/* Confirmação de exclusão (soft-delete). */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Excluir procedimento"
        subtitle="Esta ação desativa o procedimento (não aparecerá como ativo)."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={pending}>
              {pending ? "Excluindo..." : "Excluir"}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-full bg-red-50 p-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <p className="text-sm text-muted">
            Tem certeza que deseja excluir o procedimento{" "}
            <strong className="text-ink">{procedure.name}</strong> (
            {procedure.code})? Você poderá recadastrá-lo depois, se necessário.
          </p>
        </div>
      </Modal>
    </>
  );
}
