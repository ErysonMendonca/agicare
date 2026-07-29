"use client";

import { useMemo, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Wrench,
  Plus,
  Pencil,
  Trash2,
  Search,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useConfirm } from "@/lib/store/confirm";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import {
  METODOS_ESTERILIZACAO,
  esterilizacaoVencida,
  type InstrumentalConfigItem,
} from "@/lib/clinico/instrumental-shared";
import {
  addAttendanceOption,
  updateAttendanceOption,
  removeAttendanceOption,
  reorderAttendanceOptions,
} from "@/lib/actions/attendance-options";

const POR_PAGINA = 9;
const CATEGORIA = "instrumental";

type Draft = {
  label: string;
  active: boolean;
  sterilizationMethod: string;
  validityDate: string;
  lotCode: string;
};

const draftVazio = (): Draft => ({
  label: "",
  active: true,
  sterilizationMethod: "",
  validityDate: "",
  lotCode: "",
});

/** Data de hoje em yyyy-mm-dd (local), para travar o seletor de validade no passado. */
function hojeISO(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

/**
 * Catálogo PLANO de "Instrumental" (gestor): reordenação por drag-and-drop,
 * busca, paginação e CRUD via modal — mesmo padrão de CatalogoTabela, mas com
 * campos próprios de controle de esterilização (0121): método, validade
 * (calendário) e ciclo/lote (texto). Esses dados alimentam o painel exibido
 * na tela de Procedimento do prontuário ao selecionar o procedimento.
 */
export function InstrumentalConfig({ itens }: { itens: InstrumentalConfigItem[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  const [lista, setLista] = useState<InstrumentalConfigItem[]>(itens);
  const [snapshot, setSnapshot] = useState<InstrumentalConfigItem[]>(itens);
  if (snapshot !== itens) {
    setSnapshot(itens);
    setLista(itens);
  }

  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);

  const [modalAberto, setModalAberto] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(draftVazio());

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return lista;
    return lista.filter((e) => e.label.toLowerCase().includes(termo));
  }, [lista, busca]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const inicio = (paginaSegura - 1) * POR_PAGINA;
  const visiveis = filtradas.slice(inicio, inicio + POR_PAGINA);
  const buscando = busca.trim().length > 0;

  function onBuscaChange(v: string) {
    setBusca(v);
    setPagina(1);
  }

  function refresh() {
    router.refresh();
  }

  function abrirNova() {
    setEditId(null);
    setDraft(draftVazio());
    setModalAberto(true);
  }

  function abrirEdicao(e: InstrumentalConfigItem) {
    setEditId(e.id);
    setDraft({
      label: e.label,
      active: e.active,
      sterilizationMethod: e.sterilizationMethod ?? "",
      validityDate: e.validityDate ?? "",
      lotCode: e.lotCode ?? "",
    });
    setModalAberto(true);
  }

  function salvar() {
    const label = draft.label.trim();
    if (!label) {
      toast.error("O nome é obrigatório.");
      return;
    }
    // A validade é do controle de esterilização ATUAL: uma data já vencida
    // não representa um instrumental pronto para uso — precisa reesterilizar
    // e informar uma validade futura, não salvar a data vencida.
    if (draft.validityDate && esterilizacaoVencida(draft.validityDate)) {
      toast.error("A validade não pode ser anterior à data atual.");
      return;
    }

    startTransition(async () => {
      if (editId === null) {
        const res = await addAttendanceOption({
          category: CATEGORIA,
          label,
          value: label,
          sterilizationMethod: draft.sterilizationMethod,
          validityDate: draft.validityDate,
          lotCode: draft.lotCode,
        });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        if (!draft.active && res.id) {
          await updateAttendanceOption(res.id, { active: false });
        }
        toast.success("Instrumental cadastrado.");
      } else {
        const res = await updateAttendanceOption(editId, {
          label,
          value: label,
          active: draft.active,
          sterilizationMethod: draft.sterilizationMethod,
          validityDate: draft.validityDate,
          lotCode: draft.lotCode,
        });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Instrumental atualizado.");
      }
      setModalAberto(false);
      refresh();
    });
  }

  async function remover(e: InstrumentalConfigItem) {
    if (
      !(await confirm({
        message: `Remover "${e.label}"? Esta ação não pode ser desfeita.`,
        danger: true,
        confirmLabel: "Remover",
      }))
    ) {
      return;
    }
    startTransition(async () => {
      setLista((atual) => atual.filter((x) => x.id !== e.id));
      const res = await removeAttendanceOption(e.id);
      if (res.error) {
        toast.error(res.error);
        setLista(itens);
        return;
      }
      toast.success("Instrumental removido.");
      refresh();
    });
  }

  function onDragStart(id: string) {
    if (buscando) return;
    setDragId(id);
  }

  function onDragOver(ev: DragEvent, id: string) {
    if (buscando || dragId === null) return;
    ev.preventDefault();
    setOverId(id);
  }

  function onDrop(alvoId: string) {
    if (buscando || dragId === null || dragId === alvoId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const origem = lista.findIndex((e) => e.id === dragId);
    const destino = lista.findIndex((e) => e.id === alvoId);
    if (origem < 0 || destino < 0) return;

    const nova = [...lista];
    const [movido] = nova.splice(origem, 1);
    nova.splice(destino, 0, movido);
    const renumerada = nova.map((e, i) => ({ ...e, sortOrder: i + 1 }));
    setLista(renumerada);
    setDragId(null);
    setOverId(null);

    const ordemIds = renumerada.map((e) => e.id);
    startTransition(async () => {
      const res = await reorderAttendanceOptions(CATEGORIA, ordemIds);
      if (res.error) {
        toast.error(res.error);
        setLista(itens);
        return;
      }
      refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Wrench className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold text-ink">Instrumental</h3>
              <p className="text-xs text-muted">
                Gerencie os instrumentais disponíveis (reutilizáveis, sem baixa de estoque) e o
                controle de esterilização atual de cada um.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                aria-label="Buscar em Instrumental"
                value={busca}
                onChange={(e) => onBuscaChange(e.target.value)}
                placeholder="Buscar..."
                className="pl-9 sm:w-64"
              />
            </div>
            <Button type="button" variant="primary" onClick={abrirNova}>
              <Plus className="h-4 w-4" /> Novo
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-muted-surface text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="w-28 px-4 py-3">Ordem</th>
                <th className="px-4 py-3">Instrumental</th>
                <th className="w-40 px-4 py-3">Esterilização</th>
                <th className="w-32 px-4 py-3">Validade</th>
                <th className="w-28 px-4 py-3">Ciclo/Lote</th>
                <th className="w-28 px-4 py-3">Status</th>
                <th className="w-24 px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {visiveis.map((e, i) => {
                  const posicao = inicio + i + 1;
                  const arrastando = dragId === e.id;
                  const alvo = overId === e.id && dragId !== e.id;
                  const vencida = esterilizacaoVencida(e.validityDate);
                  return (
                    <motion.tr
                      key={e.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: arrastando ? 0.4 : 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      draggable={!buscando}
                      onDragStart={() => onDragStart(e.id)}
                      onDragOver={(ev) => onDragOver(ev, e.id)}
                      onDrop={() => onDrop(e.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverId(null);
                      }}
                      className={`border-b border-line last:border-0 transition-colors ${
                        alvo ? "bg-brand-50" : "hover:bg-muted-surface/60"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={`Arrastar para reordenar ${e.label}`}
                            title={
                              buscando
                                ? "Limpe a busca para reordenar"
                                : "Arraste para reordenar"
                            }
                            disabled={buscando}
                            className="cursor-grab text-muted transition-colors hover:text-ink active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-line bg-white px-1.5 text-xs font-semibold text-ink">
                            {posicao}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink">{e.label}</td>
                      <td className="px-4 py-3 text-muted">
                        {e.sterilizationMethod ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            vencida
                              ? "inline-flex items-center gap-1 font-medium text-red-600"
                              : "text-muted"
                          }
                        >
                          {vencida && <AlertTriangle className="h-3.5 w-3.5" />}
                          {fmtData(e.validityDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">{e.lotCode ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge active={e.active} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => abrirEdicao(e)}
                            disabled={pending}
                            aria-label={`Editar ${e.label}`}
                            className="rounded-lg p-2 text-muted transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => remover(e)}
                            disabled={pending}
                            aria-label={`Remover ${e.label}`}
                            className="rounded-lg p-2 text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>

              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">
                    {buscando ? "Nenhum item encontrado." : "Nenhum item cadastrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filtradas.length > 0 && (
          <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs text-muted">
              Mostrando {inicio + 1} a {Math.min(inicio + POR_PAGINA, filtradas.length)} de{" "}
              {filtradas.length} {filtradas.length === 1 ? "item" : "itens"}
            </p>
            {totalPaginas > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={paginaSegura === 1}
                  aria-label="Página anterior"
                  className="rounded-lg border border-line p-2 text-muted transition-colors hover:bg-muted-surface disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPagina(n)}
                    aria-label={`Página ${n}`}
                    aria-current={n === paginaSegura ? "page" : undefined}
                    className={
                      n === paginaSegura
                        ? "h-9 min-w-9 rounded-lg bg-brand-500 px-2 text-sm font-medium text-white"
                        : "h-9 min-w-9 rounded-lg border border-line px-2 text-sm font-medium text-muted transition-colors hover:bg-muted-surface hover:text-ink"
                    }
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={paginaSegura === totalPaginas}
                  aria-label="Próxima página"
                  className="rounded-lg border border-line p-2 text-muted transition-colors hover:bg-muted-surface disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </CardBody>

      <Modal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        title={editId === null ? "Novo — Instrumental" : "Editar — Instrumental"}
        subtitle={
          editId === null
            ? "Cadastre um novo instrumental e o controle de esterilização atual."
            : "Atualize o instrumental e o controle de esterilização atual."
        }
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setModalAberto(false)}
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
        <div className="space-y-4">
          <Input
            id="instrumental-nome"
            label="Nome"
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            placeholder="Ex.: Pinça anatômica"
            required
            autoFocus
          />
          <Select
            id="instrumental-status"
            label="Status"
            value={draft.active ? "ativo" : "inativo"}
            onChange={(e) =>
              setDraft((d) => ({ ...d, active: e.target.value === "ativo" }))
            }
          >
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </Select>

          <div className="border-t border-line pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Controle de esterilização
            </p>
            <div className="space-y-4">
              <Select
                id="instrumental-esterilizacao"
                label="Esterilização"
                value={draft.sterilizationMethod}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, sterilizationMethod: e.target.value }))
                }
              >
                <option value="">Não informado</option>
                {METODOS_ESTERILIZACAO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
              <Input
                id="instrumental-validade"
                type="date"
                label="Validade"
                value={draft.validityDate}
                min={hojeISO()}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, validityDate: e.target.value }))
                }
              />
              <Input
                id="instrumental-lote"
                label="Ciclo/Lote"
                value={draft.lotCode}
                onChange={(e) => setDraft((d) => ({ ...d, lotCode: e.target.value }))}
                placeholder="Ex.: Ciclo 042 / Lote 2026-07"
              />
            </div>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        active ? "bg-green-50 text-green-600" : "bg-muted-surface text-muted"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-green-500" : "bg-muted"}`} />
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}
