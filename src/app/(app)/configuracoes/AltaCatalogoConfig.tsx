"use client";

import { useMemo, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  LogOut,
  Search,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useConfirm } from "@/lib/store/confirm";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import type { MotivoAltaCfg, DetalheAltaCfg } from "@/lib/data/alta";
import {
  addAttendanceOption,
  updateAttendanceOption,
  removeAttendanceOption,
  reorderAttendanceOptions,
} from "@/lib/actions/attendance-options";

const CAT_MOTIVO = "motivo_alta";
const CAT_DETALHE = "detalhe_alta";
const POR_PAGINA = 9;

type MotivoDraft = { label: string; active: boolean };
type DetalheDraft = { label: string; active: boolean; parentId: string };

const motivoVazio = (): MotivoDraft => ({ label: "", active: true });
const detalheVazio = (parentId: string): DetalheDraft => ({
  label: "",
  active: true,
  parentId,
});

/**
 * Catálogo da ALTA (gestor) unificando "Motivos de Alta" e "Detalhes de Alta"
 * numa tabela hierárquica: cada motivo é expansível e revela seus detalhes.
 * Espelha o padrão da tabela rica de Especialidades (busca, paginação,
 * drag-reorder otimista nos motivos, CRUD via modal). Reaproveita a infra de
 * `attendance_options` (categorias `motivo_alta`/`detalhe_alta`, com
 * parent_id ligando detalhe → motivo).
 */
export function AltaCatalogoConfig({
  motivos,
  detalhes,
}: {
  motivos: MotivoAltaCfg[];
  detalhes: DetalheAltaCfg[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  // Cópia local para refletir reordenação otimista (drag) antes do refresh.
  const [lista, setLista] = useState<MotivoAltaCfg[]>(motivos);
  const [snapshot, setSnapshot] = useState<MotivoAltaCfg[]>(motivos);
  if (snapshot !== motivos) {
    setSnapshot(motivos);
    setLista(motivos);
  }

  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);

  // Ids de motivos expandidos (estado puramente local).
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  // Modal de motivo. `editMotivoId === null` → criação.
  const [motivoModal, setMotivoModal] = useState(false);
  const [editMotivoId, setEditMotivoId] = useState<string | null>(null);
  const [motivoDraft, setMotivoDraft] = useState<MotivoDraft>(motivoVazio());

  // Modal de detalhe. `editDetalheId === null` → criação (parentId fixo).
  const [detalheModal, setDetalheModal] = useState(false);
  const [editDetalheId, setEditDetalheId] = useState<string | null>(null);
  const [detalheDraft, setDetalheDraft] = useState<DetalheDraft>(
    detalheVazio(""),
  );

  // Drag-and-drop (só motivos).
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return lista;
    return lista.filter((m) => m.label.toLowerCase().includes(termo));
  }, [lista, busca]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const inicio = (paginaSegura - 1) * POR_PAGINA;
  const visiveis = filtrados.slice(inicio, inicio + POR_PAGINA);
  const buscando = busca.trim().length > 0;

  // Detalhes agrupados por motivo, já ordenados por sortOrder.
  const detalhesPorMotivo = useMemo(() => {
    const mapa = new Map<string, DetalheAltaCfg[]>();
    for (const d of detalhes) {
      if (!d.parentId) continue;
      const arr = mapa.get(d.parentId) ?? [];
      arr.push(d);
      mapa.set(d.parentId, arr);
    }
    for (const arr of mapa.values()) {
      arr.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return mapa;
  }, [detalhes]);

  function onBuscaChange(v: string) {
    setBusca(v);
    setPagina(1);
  }

  function refresh() {
    router.refresh();
  }

  function toggleExpandir(id: string) {
    setExpandidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  // ── Modal de MOTIVO ────────────────────────────────────────────
  function abrirNovoMotivo() {
    setEditMotivoId(null);
    setMotivoDraft(motivoVazio());
    setMotivoModal(true);
  }

  function abrirEdicaoMotivo(m: MotivoAltaCfg) {
    setEditMotivoId(m.id);
    setMotivoDraft({ label: m.label, active: m.active });
    setMotivoModal(true);
  }

  function salvarMotivo() {
    const label = motivoDraft.label.trim();
    if (!label) {
      toast.error("O nome do motivo é obrigatório.");
      return;
    }
    startTransition(async () => {
      if (editMotivoId === null) {
        const res = await addAttendanceOption({
          category: CAT_MOTIVO,
          label,
          value: label,
        });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        if (!motivoDraft.active && res.id) {
          await updateAttendanceOption(res.id, { active: false });
        }
        toast.success("Motivo de alta cadastrado.");
      } else {
        const res = await updateAttendanceOption(editMotivoId, {
          label,
          value: label,
          active: motivoDraft.active,
        });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Motivo de alta atualizado.");
      }
      setMotivoModal(false);
      refresh();
    });
  }

  async function removerMotivo(m: MotivoAltaCfg) {
    if (
      !(await confirm({
        message: `Remover o motivo "${m.label}"? Os detalhes vinculados também serão removidos. Esta ação não pode ser desfeita.`,
        danger: true,
        confirmLabel: "Remover",
      }))
    ) {
      return;
    }
    startTransition(async () => {
      setLista((atual) => atual.filter((x) => x.id !== m.id));
      const res = await removeAttendanceOption(m.id);
      if (res.error) {
        toast.error(res.error);
        setLista(motivos);
        return;
      }
      toast.success("Motivo de alta removido.");
      refresh();
    });
  }

  // ── Modal de DETALHE ───────────────────────────────────────────
  function abrirNovoDetalhe(motivoId: string) {
    setEditDetalheId(null);
    setDetalheDraft(detalheVazio(motivoId));
    setDetalheModal(true);
  }

  function abrirEdicaoDetalhe(d: DetalheAltaCfg) {
    setEditDetalheId(d.id);
    setDetalheDraft({
      label: d.label,
      active: d.active,
      parentId: d.parentId ?? "",
    });
    setDetalheModal(true);
  }

  function salvarDetalhe() {
    const label = detalheDraft.label.trim();
    if (!label) {
      toast.error("O nome do detalhe é obrigatório.");
      return;
    }
    startTransition(async () => {
      if (editDetalheId === null) {
        const res = await addAttendanceOption({
          category: CAT_DETALHE,
          label,
          value: label,
          parentId: detalheDraft.parentId,
        });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        if (!detalheDraft.active && res.id) {
          await updateAttendanceOption(res.id, { active: false });
        }
        toast.success("Detalhe de alta cadastrado.");
      } else {
        const res = await updateAttendanceOption(editDetalheId, {
          label,
          value: label,
          active: detalheDraft.active,
        });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Detalhe de alta atualizado.");
      }
      setDetalheModal(false);
      refresh();
    });
  }

  async function removerDetalhe(d: DetalheAltaCfg) {
    if (
      !(await confirm({
        message: `Remover o detalhe "${d.label}"? Esta ação não pode ser desfeita.`,
        danger: true,
        confirmLabel: "Remover",
      }))
    ) {
      return;
    }
    startTransition(async () => {
      const res = await removeAttendanceOption(d.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Detalhe de alta removido.");
      refresh();
    });
  }

  // ── Drag-and-drop (reordenação dos motivos) ────────────────────
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
    const origem = lista.findIndex((m) => m.id === dragId);
    const destino = lista.findIndex((m) => m.id === alvoId);
    if (origem < 0 || destino < 0) return;

    const nova = [...lista];
    const [movido] = nova.splice(origem, 1);
    nova.splice(destino, 0, movido);
    const renumerada = nova.map((m, i) => ({ ...m, sortOrder: i + 1 }));
    setLista(renumerada);
    setDragId(null);
    setOverId(null);

    const ordemIds = renumerada.map((m) => m.id);
    startTransition(async () => {
      const res = await reorderAttendanceOptions(CAT_MOTIVO, ordemIds);
      if (res.error) {
        toast.error(res.error);
        setLista(motivos);
        return;
      }
      refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        {/* Cabeçalho */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <LogOut className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-ink">Motivos e Detalhes de Alta</h3>
              <p className="text-xs text-muted">
                Gerencie os motivos de alta e os detalhes vinculados a cada
                motivo.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                aria-label="Buscar motivo de alta"
                value={busca}
                onChange={(e) => onBuscaChange(e.target.value)}
                placeholder="Buscar motivo..."
                className="pl-9 sm:w-64"
              />
            </div>
            <Button type="button" variant="primary" onClick={abrirNovoMotivo}>
              <Plus className="h-4 w-4" /> Novo Motivo
            </Button>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-muted-surface text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="w-28 px-4 py-3">Ordem</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="w-28 px-4 py-3">Status</th>
                <th className="w-32 px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {visiveis.map((m, i) => {
                  const posicao = inicio + i + 1;
                  const arrastando = dragId === m.id;
                  const alvo = overId === m.id && dragId !== m.id;
                  const aberto = expandidos.has(m.id);
                  const filhos = detalhesPorMotivo.get(m.id) ?? [];
                  return [
                      <motion.tr
                        key={m.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: arrastando ? 0.4 : 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        draggable={!buscando}
                        onDragStart={() => onDragStart(m.id)}
                        onDragOver={(ev) => onDragOver(ev, m.id)}
                        onDrop={() => onDrop(m.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverId(null);
                        }}
                        className={`border-b border-line transition-colors ${
                          alvo ? "bg-brand-50" : "hover:bg-muted-surface/60"
                        } ${aberto ? "bg-muted-surface/40" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-label={`Arrastar para reordenar ${m.label}`}
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
                        <td className="px-4 py-3 font-semibold text-ink">
                          <div className="flex items-center gap-2">
                            {m.label}
                            {filhos.length > 0 && (
                              <span className="rounded-full bg-muted-surface px-2 py-0.5 text-xs font-medium text-muted">
                                {filhos.length}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge active={m.active} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => toggleExpandir(m.id)}
                              aria-label={
                                aberto
                                  ? `Recolher detalhes de ${m.label}`
                                  : `Expandir detalhes de ${m.label}`
                              }
                              aria-expanded={aberto}
                              className="rounded-lg p-2 text-muted transition-colors hover:bg-brand-50 hover:text-brand-600"
                            >
                              {aberto ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => abrirEdicaoMotivo(m)}
                              disabled={pending}
                              aria-label={`Editar ${m.label}`}
                              className="rounded-lg p-2 text-muted transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removerMotivo(m)}
                              disabled={pending}
                              aria-label={`Remover ${m.label}`}
                              className="rounded-lg p-2 text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>,

                      <AnimatePresence key={`${m.id}-ap`} initial={false}>
                        {aberto && (
                          <motion.tr
                            key={`${m.id}-detalhes`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="border-b border-line"
                          >
                            <td colSpan={4} className="bg-muted-surface/30 px-4 py-4">
                              <div className="ml-6 rounded-lg border border-line bg-white">
                                <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                                    Detalhes de &ldquo;{m.label}&rdquo;
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => abrirNovoDetalhe(m.id)}
                                  >
                                    <Plus className="h-4 w-4" /> Novo detalhe
                                  </Button>
                                </div>
                                {filhos.length === 0 ? (
                                  <p className="px-4 py-6 text-center text-sm text-muted">
                                    Nenhum detalhe para este motivo.
                                  </p>
                                ) : (
                                  <ul className="divide-y divide-line">
                                    {filhos.map((d) => (
                                      <li
                                        key={d.id}
                                        className="flex items-center justify-between gap-3 px-4 py-2.5"
                                      >
                                        <div className="flex items-center gap-3">
                                          <span className="text-sm text-ink">
                                            {d.label}
                                          </span>
                                          <StatusBadge active={d.active} />
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => abrirEdicaoDetalhe(d)}
                                            disabled={pending}
                                            aria-label={`Editar detalhe ${d.label}`}
                                            className="rounded-lg p-2 text-muted transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50"
                                          >
                                            <Pencil className="h-4 w-4" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => removerDetalhe(d)}
                                            disabled={pending}
                                            aria-label={`Remover detalhe ${d.label}`}
                                            className="rounded-lg p-2 text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        )}
                      </AnimatePresence>,
                  ];
                })}
              </AnimatePresence>

              {visiveis.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-12 text-center text-sm text-muted"
                  >
                    {buscando
                      ? "Nenhum motivo de alta encontrado."
                      : "Nenhum motivo de alta cadastrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé: contagem + paginação */}
        {filtrados.length > 0 && (
          <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs text-muted">
              Mostrando {inicio + 1} a{" "}
              {Math.min(inicio + POR_PAGINA, filtrados.length)} de{" "}
              {filtrados.length}{" "}
              {filtrados.length === 1 ? "motivo" : "motivos"}
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
                {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(
                  (n) => (
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
                  ),
                )}
                <button
                  type="button"
                  onClick={() =>
                    setPagina((p) => Math.min(totalPaginas, p + 1))
                  }
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

      {/* Modal de MOTIVO */}
      <Modal
        open={motivoModal}
        onClose={() => setMotivoModal(false)}
        title={editMotivoId === null ? "Novo Motivo de Alta" : "Editar Motivo de Alta"}
        subtitle={
          editMotivoId === null
            ? "Cadastre um novo motivo de alta."
            : "Atualize os dados do motivo de alta."
        }
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMotivoModal(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={salvarMotivo}
              disabled={pending}
            >
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            id="motivo-nome"
            label="Nome"
            value={motivoDraft.label}
            onChange={(e) =>
              setMotivoDraft((d) => ({ ...d, label: e.target.value }))
            }
            placeholder="Ex.: Melhora clínica"
            required
            autoFocus
          />
          <Select
            id="motivo-status"
            label="Status"
            value={motivoDraft.active ? "ativo" : "inativo"}
            onChange={(e) =>
              setMotivoDraft((d) => ({
                ...d,
                active: e.target.value === "ativo",
              }))
            }
          >
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </Select>
        </div>
      </Modal>

      {/* Modal de DETALHE */}
      <Modal
        open={detalheModal}
        onClose={() => setDetalheModal(false)}
        title={editDetalheId === null ? "Novo Detalhe de Alta" : "Editar Detalhe de Alta"}
        subtitle={
          editDetalheId === null
            ? "Cadastre um novo detalhe vinculado ao motivo."
            : "Atualize os dados do detalhe de alta."
        }
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDetalheModal(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={salvarDetalhe}
              disabled={pending}
            >
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            id="detalhe-nome"
            label="Nome"
            value={detalheDraft.label}
            onChange={(e) =>
              setDetalheDraft((d) => ({ ...d, label: e.target.value }))
            }
            placeholder="Ex.: Sintomas resolvidos"
            required
            autoFocus
          />
          <Select
            id="detalhe-status"
            label="Status"
            value={detalheDraft.active ? "ativo" : "inativo"}
            onChange={(e) =>
              setDetalheDraft((d) => ({
                ...d,
                active: e.target.value === "ativo",
              }))
            }
          >
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </Select>
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
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          active ? "bg-green-500" : "bg-muted"
        }`}
      />
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}
