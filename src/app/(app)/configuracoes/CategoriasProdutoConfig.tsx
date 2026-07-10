"use client";

import { useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  FolderTree,
  ChevronRight,
  Eye,
  EyeOff,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useConfirm } from "@/lib/store/confirm";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import type { ProductCategoryNode } from "@/lib/data/product-categories";
import {
  addProductCategory,
  updateProductCategory,
  removeProductCategory,
  reorderProductCategories,
} from "@/lib/actions/product-categories";

// ════════════════════════════════════════════════════════════════
// Gestão da árvore de categorias de produto (3 níveis, migration 0105).
// Três colunas encadeadas: escolher o Grupo popula as Classificações, e assim
// por diante — mesmo padrão de otimismo/drag-and-drop do CatalogoTabela, mas
// sem herdar dele (aquele é acoplado a attendance_options).
// ════════════════════════════════════════════════════════════════

/** Rótulos de cada nível (1..3), usados nos cabeçalhos e mensagens. */
const NIVEIS = [
  { titulo: "Grupos", singular: "grupo", placeholder: "Ex.: Drogas e Medicamentos" },
  { titulo: "Classificações", singular: "classificação", placeholder: "Ex.: Antibióticos" },
  {
    titulo: "Subclassificações",
    singular: "subclassificação",
    placeholder: "Ex.: Penicilinas",
  },
] as const;

type ModalState = {
  /** null = criando; caso contrário, id do nó em edição. */
  id: string | null;
  /** Nível (1..3) da categoria sendo criada/editada. */
  nivel: 1 | 2 | 3;
  /** Pai da categoria (null apenas no nível 1). */
  parentId: string | null;
  label: string;
};

export function CategoriasProdutoConfig({
  categorias,
}: {
  categorias: ProductCategoryNode[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  // Cópia local da árvore para refletir drag/exclusão antes do refresh do server.
  const [arvore, setArvore] = useState<ProductCategoryNode[]>(categorias);
  const [snapshot, setSnapshot] = useState<ProductCategoryNode[]>(categorias);
  if (snapshot !== categorias) {
    setSnapshot(categorias);
    setArvore(categorias);
  }

  const [grupoId, setGrupoId] = useState<string | null>(null);
  const [classifId, setClassifId] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalState | null>(null);

  // Seleções resolvidas contra a árvore atual: se o nó sumiu (exclusão em
  // cascata, refresh do servidor), a coluna filha volta ao estado vazio.
  const grupo = arvore.find((g) => g.id === grupoId) ?? null;
  const classif = grupo?.children.find((c) => c.id === classifId) ?? null;

  /** Substitui os filhos de `parentId` (ou a raiz) na cópia local. */
  function aplicarLocal(
    parentId: string | null,
    fn: (irmaos: ProductCategoryNode[]) => ProductCategoryNode[],
  ) {
    setArvore((atual) => {
      if (parentId === null) return fn(atual);
      return atual.map((g) => {
        if (g.id === parentId) return { ...g, children: fn(g.children) };
        return {
          ...g,
          children: g.children.map((c) =>
            c.id === parentId ? { ...c, children: fn(c.children) } : c,
          ),
        };
      });
    });
  }

  function salvar() {
    if (!modal) return;
    const label = modal.label.trim();
    if (!label) {
      toast.error("O nome é obrigatório.");
      return;
    }

    startTransition(async () => {
      const res =
        modal.id === null
          ? await addProductCategory({
              parentId: modal.parentId,
              level: modal.nivel,
              label,
            })
          : await updateProductCategory({ id: modal.id, label });

      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(modal.id === null ? "Categoria cadastrada." : "Categoria atualizada.");
      setModal(null);
      router.refresh();
    });
  }

  function alternarAtivo(no: ProductCategoryNode, parentId: string | null) {
    startTransition(async () => {
      // Otimismo: o badge inverte antes do round-trip.
      aplicarLocal(parentId, (irmaos) =>
        irmaos.map((x) => (x.id === no.id ? { ...x, active: !x.active } : x)),
      );
      const res = await updateProductCategory({ id: no.id, active: !no.active });
      if (res.error) {
        toast.error(res.error);
        setArvore(categorias);
        return;
      }
      toast.success(no.active ? "Categoria inativada." : "Categoria ativada.");
      router.refresh();
    });
  }

  async function remover(no: ProductCategoryNode, parentId: string | null, nivel: number) {
    // O DELETE cascateia (FK auto-referente): avisar o que mais vai embora.
    const filhos = contarDescendentes(no);
    const aviso =
      filhos > 0
        ? ` Isso também exclui ${filhos} ${filhos === 1 ? "subcategoria" : "subcategorias"} abaixo dela.`
        : "";

    if (
      !(await confirm({
        message: `Remover "${no.label}"?${aviso} Esta ação não pode ser desfeita.`,
        danger: true,
        confirmLabel: "Remover",
      }))
    ) {
      return;
    }

    startTransition(async () => {
      aplicarLocal(parentId, (irmaos) => irmaos.filter((x) => x.id !== no.id));
      if (nivel === 1 && grupoId === no.id) setGrupoId(null);
      if (nivel <= 2 && classifId === no.id) setClassifId(null);

      const res = await removeProductCategory({ id: no.id });
      if (res.error) {
        toast.error(res.error);
        setArvore(categorias);
        return;
      }
      toast.success("Categoria removida.");
      router.refresh();
    });
  }

  function reordenar(parentId: string | null, nova: ProductCategoryNode[]) {
    aplicarLocal(
      parentId,
      () => nova.map((n, i) => ({ ...n, sortOrder: i })),
    );
    startTransition(async () => {
      const res = await reorderProductCategories({
        parentId,
        ids: nova.map((n) => n.id),
      });
      if (res.error) {
        toast.error(res.error);
        setArvore(categorias);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        {/* Cabeçalho */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <FolderTree className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-ink">Categorias</h3>
            <p className="text-xs text-muted">
              Árvore de Grupo → Classificação → Subclassificação usada no cadastro
              de produto.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Coluna
            nivel={1}
            itens={arvore}
            selecionadoId={grupo?.id ?? null}
            onSelect={(id) => {
              setGrupoId(id);
              setClassifId(null);
            }}
            onNovo={() => setModal({ id: null, nivel: 1, parentId: null, label: "" })}
            onEditar={(n) =>
              setModal({ id: n.id, nivel: 1, parentId: null, label: n.label })
            }
            onAlternar={(n) => alternarAtivo(n, null)}
            onRemover={(n) => remover(n, null, 1)}
            onReordenar={(nova) => reordenar(null, nova)}
            pending={pending}
          />

          <Coluna
            nivel={2}
            itens={grupo?.children ?? []}
            selecionadoId={classif?.id ?? null}
            onSelect={setClassifId}
            onNovo={() =>
              grupo &&
              setModal({ id: null, nivel: 2, parentId: grupo.id, label: "" })
            }
            onEditar={(n) =>
              setModal({
                id: n.id,
                nivel: 2,
                parentId: grupo?.id ?? null,
                label: n.label,
              })
            }
            onAlternar={(n) => alternarAtivo(n, grupo?.id ?? null)}
            onRemover={(n) => remover(n, grupo?.id ?? null, 2)}
            onReordenar={(nova) => grupo && reordenar(grupo.id, nova)}
            pending={pending}
            bloqueio={grupo ? null : "Selecione um grupo à esquerda para ver e criar suas classificações."}
            contexto={grupo?.label}
          />

          <Coluna
            nivel={3}
            itens={classif?.children ?? []}
            selecionadoId={null}
            onNovo={() =>
              classif &&
              setModal({ id: null, nivel: 3, parentId: classif.id, label: "" })
            }
            onEditar={(n) =>
              setModal({
                id: n.id,
                nivel: 3,
                parentId: classif?.id ?? null,
                label: n.label,
              })
            }
            onAlternar={(n) => alternarAtivo(n, classif?.id ?? null)}
            onRemover={(n) => remover(n, classif?.id ?? null, 3)}
            onReordenar={(nova) => classif && reordenar(classif.id, nova)}
            pending={pending}
            bloqueio={
              classif
                ? null
                : grupo
                  ? "Selecione uma classificação para ver e criar suas subclassificações."
                  : "Selecione um grupo e uma classificação para começar."
            }
            contexto={classif?.label}
          />
        </div>
      </CardBody>

      {/* Modal de criação / edição */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={
          modal
            ? `${modal.id === null ? "Nova" : "Editar"} — ${NIVEIS[modal.nivel - 1].titulo}`
            : ""
        }
        subtitle={
          modal
            ? modal.id === null
              ? `Cadastre uma nova ${NIVEIS[modal.nivel - 1].singular}.`
              : `Atualize a ${NIVEIS[modal.nivel - 1].singular}.`
            : undefined
        }
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setModal(null)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="button" variant="primary" onClick={salvar} disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        {modal && (
          <Input
            id="categoria-produto-nome"
            label="Nome"
            value={modal.label}
            onChange={(e) =>
              setModal((m) => (m ? { ...m, label: e.target.value } : m))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                salvar();
              }
            }}
            placeholder={NIVEIS[modal.nivel - 1].placeholder}
            required
            autoFocus
          />
        )}
      </Modal>
    </Card>
  );
}

/** Quantos nós existem abaixo de `no` (usado no aviso de exclusão em cascata). */
function contarDescendentes(no: ProductCategoryNode): number {
  return no.children.reduce((total, f) => total + 1 + contarDescendentes(f), 0);
}

type ColunaProps = {
  nivel: 1 | 2 | 3;
  itens: ProductCategoryNode[];
  selecionadoId?: string | null;
  onSelect?: (id: string) => void;
  onNovo: () => void;
  onEditar: (no: ProductCategoryNode) => void;
  onAlternar: (no: ProductCategoryNode) => void;
  onRemover: (no: ProductCategoryNode) => void;
  onReordenar: (nova: ProductCategoryNode[]) => void;
  pending: boolean;
  /** Se preenchido, a coluna está travada: mostra este texto no lugar da lista. */
  bloqueio?: string | null;
  /** Rótulo do pai selecionado, exibido como migalha no cabeçalho. */
  contexto?: string;
};

function Coluna({
  nivel,
  itens,
  selecionadoId = null,
  onSelect,
  onNovo,
  onEditar,
  onAlternar,
  onRemover,
  onReordenar,
  pending,
  bloqueio = null,
  contexto,
}: ColunaProps) {
  const meta = NIVEIS[nivel - 1];
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const travada = bloqueio !== null;
  const selecionavel = Boolean(onSelect);

  function onDragOver(ev: DragEvent, id: string) {
    if (dragId === null) return;
    ev.preventDefault();
    setOverId(id);
  }

  function onDrop(alvoId: string) {
    const origem = itens.findIndex((n) => n.id === dragId);
    const destino = itens.findIndex((n) => n.id === alvoId);
    setDragId(null);
    setOverId(null);
    if (dragId === null || dragId === alvoId || origem < 0 || destino < 0) return;

    const nova = [...itens];
    const [movido] = nova.splice(origem, 1);
    nova.splice(destino, 0, movido);
    onReordenar(nova);
  }

  return (
    <section
      aria-label={meta.titulo}
      className="flex min-h-[22rem] flex-col rounded-xl border border-line bg-white"
    >
      {/* Cabeçalho da coluna */}
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-ink">{meta.titulo}</h4>
          <p className="truncate text-xs text-muted">
            {contexto ? (
              <span className="inline-flex items-center gap-0.5">
                <ChevronRight className="h-3 w-3 shrink-0" />
                {contexto}
              </span>
            ) : (
              `${itens.length} ${itens.length === 1 ? "item" : "itens"}`
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={onNovo}
          disabled={travada || pending}
          aria-label={`Adicionar ${meta.singular}`}
          className="shrink-0"
        >
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </header>

      {/* Corpo: bloqueio, vazio ou lista */}
      {travada ? (
        <p className="flex flex-1 items-center justify-center px-6 py-10 text-center text-sm text-muted">
          {bloqueio}
        </p>
      ) : itens.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-6 py-10 text-center text-sm text-muted">
          Nenhuma {meta.singular} cadastrada.
        </p>
      ) : (
        <ul className="flex-1 space-y-1 p-2">
          <AnimatePresence initial={false}>
            {itens.map((no) => {
              const arrastando = dragId === no.id;
              const alvo = overId === no.id && dragId !== no.id;
              const selecionado = selecionadoId === no.id;
              return (
                <motion.li
                  key={no.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: arrastando ? 0.4 : 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  draggable
                  onDragStart={() => setDragId(no.id)}
                  onDragOver={(ev) => onDragOver(ev, no.id)}
                  onDrop={() => onDrop(no.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  className={`group flex items-center gap-1 rounded-lg border px-2 py-1.5 transition-colors ${
                    selecionado
                      ? "border-brand-200 bg-brand-50"
                      : alvo
                        ? "border-brand-200 bg-brand-50/60"
                        : "border-transparent hover:bg-muted-surface/60"
                  }`}
                >
                  <span
                    aria-hidden
                    title="Arraste para reordenar"
                    className="cursor-grab text-muted active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>

                  {/* O item é um botão quando a coluna alimenta a próxima. */}
                  {selecionavel ? (
                    <button
                      type="button"
                      onClick={() => onSelect?.(no.id)}
                      aria-pressed={selecionado}
                      className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-sm font-medium text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-100"
                    >
                      <span className={no.active ? "" : "text-muted line-through"}>
                        {no.label}
                      </span>
                    </button>
                  ) : (
                    <span
                      className={`min-w-0 flex-1 truncate px-1 text-sm font-medium ${
                        no.active ? "text-ink" : "text-muted line-through"
                      }`}
                    >
                      {no.label}
                    </span>
                  )}

                  <div className="flex shrink-0 items-center opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => onAlternar(no)}
                      disabled={pending}
                      aria-label={`${no.active ? "Inativar" : "Ativar"} ${no.label}`}
                      title={no.active ? "Inativar" : "Ativar"}
                      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50"
                    >
                      {no.active ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditar(no)}
                      disabled={pending}
                      aria-label={`Editar ${no.label}`}
                      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemover(no)}
                      disabled={pending}
                      aria-label={`Remover ${no.label}`}
                      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
