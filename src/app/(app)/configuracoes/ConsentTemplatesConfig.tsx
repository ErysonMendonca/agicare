"use client";

import { useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  ScrollText,
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
import type { ConsentTemplate } from "@/lib/data/consent-templates";
import {
  addConsentTemplate,
  updateConsentTemplate,
  removeConsentTemplate,
  reorderConsentTemplates,
} from "@/lib/actions/consent-templates";

// ════════════════════════════════════════════════════════════════
// Gestão dos termos de consentimento (gestor-only). Cada termo tem título +
// corpo (texto livre) e é impresso junto da Ficha de Atendimento para o
// paciente assinar. Ordem definida por arrastar (mesmo padrão de otimismo do
// CategoriasProdutoConfig).
// ════════════════════════════════════════════════════════════════

type ModalState = {
  /** null = criando; caso contrário, id do termo em edição. */
  id: string | null;
  title: string;
  body: string;
};

export function ConsentTemplatesConfig({
  termos,
}: {
  termos: ConsentTemplate[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  // Cópia local p/ refletir drag/exclusão antes do refresh do servidor.
  const [lista, setLista] = useState<ConsentTemplate[]>(termos);
  const [snapshot, setSnapshot] = useState<ConsentTemplate[]>(termos);
  if (snapshot !== termos) {
    setSnapshot(termos);
    setLista(termos);
  }

  const [modal, setModal] = useState<ModalState | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function salvar() {
    if (!modal) return;
    const title = modal.title.trim();
    const body = modal.body.trim();
    if (!title) {
      toast.error("O título é obrigatório.");
      return;
    }
    if (!body) {
      toast.error("O texto do termo é obrigatório.");
      return;
    }

    startTransition(async () => {
      const res =
        modal.id === null
          ? await addConsentTemplate({ title, body })
          : await updateConsentTemplate({ id: modal.id, title, body });

      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(modal.id === null ? "Termo cadastrado." : "Termo atualizado.");
      setModal(null);
      router.refresh();
    });
  }

  function alternarAtivo(t: ConsentTemplate) {
    startTransition(async () => {
      // Otimismo: inverte o badge antes do round-trip.
      setLista((atual) =>
        atual.map((x) => (x.id === t.id ? { ...x, active: !x.active } : x)),
      );
      const res = await updateConsentTemplate({ id: t.id, active: !t.active });
      if (res.error) {
        toast.error(res.error);
        setLista(termos);
        return;
      }
      toast.success(t.active ? "Termo inativado." : "Termo ativado.");
      router.refresh();
    });
  }

  async function remover(t: ConsentTemplate) {
    if (
      !(await confirm({
        message: `Remover o termo "${t.title}"? Esta ação não pode ser desfeita.`,
        danger: true,
        confirmLabel: "Remover",
      }))
    ) {
      return;
    }
    startTransition(async () => {
      setLista((atual) => atual.filter((x) => x.id !== t.id));
      const res = await removeConsentTemplate({ id: t.id });
      if (res.error) {
        toast.error(res.error);
        setLista(termos);
        return;
      }
      toast.success("Termo removido.");
      router.refresh();
    });
  }

  function onDragOver(ev: DragEvent, id: string) {
    if (dragId === null) return;
    ev.preventDefault();
    setOverId(id);
  }

  function onDrop(alvoId: string) {
    const origem = lista.findIndex((n) => n.id === dragId);
    const destino = lista.findIndex((n) => n.id === alvoId);
    setDragId(null);
    setOverId(null);
    if (dragId === null || dragId === alvoId || origem < 0 || destino < 0) return;

    const nova = [...lista];
    const [movido] = nova.splice(origem, 1);
    nova.splice(destino, 0, movido);
    setLista(nova.map((n, i) => ({ ...n, sortOrder: i })));

    startTransition(async () => {
      const res = await reorderConsentTemplates({ ids: nova.map((n) => n.id) });
      if (res.error) {
        toast.error(res.error);
        setLista(termos);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        {/* Cabeçalho */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <ScrollText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-ink">Consentimentos</h3>
              <p className="text-xs text-muted">
                Termos impressos junto da Ficha de Atendimento para o paciente
                assinar. Só os termos ativos entram na impressão.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            onClick={() => setModal({ id: null, title: "", body: "" })}
            disabled={pending}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" /> Novo termo
          </Button>
        </div>

        {lista.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
            Nenhum termo cadastrado. Clique em “Novo termo” para começar.
          </p>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {lista.map((t) => {
                const arrastando = dragId === t.id;
                const alvo = overId === t.id && dragId !== t.id;
                return (
                  <motion.li
                    key={t.id}
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: arrastando ? 0.4 : 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    draggable
                    onDragStart={() => setDragId(t.id)}
                    onDragOver={(ev) => onDragOver(ev, t.id)}
                    onDrop={() => onDrop(t.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                    className={`group flex items-start gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                      alvo
                        ? "border-brand-200 bg-brand-50/60"
                        : "border-line hover:bg-muted-surface/60"
                    }`}
                  >
                    <span
                      aria-hidden
                      title="Arraste para reordenar"
                      className="mt-0.5 cursor-grab text-muted active:cursor-grabbing"
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={`truncate text-sm font-semibold ${
                            t.active ? "text-ink" : "text-muted line-through"
                          }`}
                        >
                          {t.title}
                        </p>
                        {!t.active && (
                          <span className="rounded bg-muted-surface px-1.5 py-0.5 text-[10px] font-medium text-muted">
                            Inativo
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.body}</p>
                    </div>

                    <div className="flex shrink-0 items-center opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => alternarAtivo(t)}
                        disabled={pending}
                        aria-label={`${t.active ? "Inativar" : "Ativar"} ${t.title}`}
                        title={t.active ? "Inativar" : "Ativar"}
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50"
                      >
                        {t.active ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setModal({ id: t.id, title: t.title, body: t.body })
                        }
                        disabled={pending}
                        aria-label={`Editar ${t.title}`}
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remover(t)}
                        disabled={pending}
                        aria-label={`Remover ${t.title}`}
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
      </CardBody>

      {/* Modal de criação / edição */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal?.id === null ? "Novo termo de consentimento" : "Editar termo"}
        subtitle="O título aparece como cabeçalho do documento; o texto é o corpo assinado pelo paciente."
        className="max-w-2xl"
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
          <div className="space-y-4">
            <Input
              id="consent-title"
              label="Título"
              value={modal.title}
              onChange={(e) =>
                setModal((m) => (m ? { ...m, title: e.target.value } : m))
              }
              placeholder="Ex.: Termo de Consentimento e Responsabilidade"
              required
              autoFocus
            />
            <div>
              <label
                htmlFor="consent-body"
                className="mb-1.5 block text-sm font-medium text-ink"
              >
                Texto do termo
              </label>
              <textarea
                id="consent-body"
                rows={10}
                value={modal.body}
                onChange={(e) =>
                  setModal((m) => (m ? { ...m, body: e.target.value } : m))
                }
                placeholder="Redija o texto que o paciente vai ler e assinar…"
                className="w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <p className="mt-1 text-xs text-muted">
                As quebras de linha são preservadas na impressão.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
