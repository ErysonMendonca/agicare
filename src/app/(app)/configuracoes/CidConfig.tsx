"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  Stethoscope,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useConfirm } from "@/lib/store/confirm";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import type { CidCode } from "@/lib/data/cid";
import { addCid, updateCid, removeCid } from "@/lib/actions/cid";

const POR_PAGINA = 9;

type Draft = {
  code: string;
  description: string;
};

const draftVazio = (): Draft => ({
  code: "",
  description: "",
});

export function CidConfig({ cids }: { cids: CidCode[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  const [lista, setLista] = useState<CidCode[]>(cids);
  const [snapshot, setSnapshot] = useState<CidCode[]>(cids);
  if (snapshot !== cids) {
    setSnapshot(cids);
    setLista(cids);
  }

  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);

  const [modalAberto, setModalAberto] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(draftVazio());

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return lista;
    return lista.filter(
      (c) =>
        c.code.toLowerCase().includes(termo) ||
        c.description.toLowerCase().includes(termo),
    );
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

  function abrirNovo() {
    setEditId(null);
    setDraft(draftVazio());
    setModalAberto(true);
  }

  function abrirEdicao(c: CidCode) {
    setEditId(c.id);
    setDraft({
      code: c.code,
      description: c.description,
    });
    setModalAberto(true);
  }

  function salvar() {
    const code = draft.code.trim();
    const description = draft.description.trim();
    if (!code || !description) {
      toast.error("O código e a descrição do CID são obrigatórios.");
      return;
    }

    startTransition(async () => {
      if (editId === null) {
        const res = await addCid({ code, description });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("CID adicionado.");
      } else {
        const res = await updateCid(editId, { code, description });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("CID atualizado.");
      }
      setModalAberto(false);
      refresh();
    });
  }

  async function remover(c: CidCode) {
    if (
      !(await confirm({
        message: `Remover o CID "${c.code}"? Esta ação não pode ser desfeita.`,
        danger: true,
        confirmLabel: "Remover",
      }))
    ) {
      return;
    }
    startTransition(async () => {
      setLista((atual) => atual.filter((x) => x.id !== c.id));
      const res = await removeCid(c.id);
      if (res.error) {
        toast.error(res.error);
        setLista(cids);
        return;
      }
      toast.success("CID removido.");
      refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-ink">Catálogo CID</h3>
              <p className="text-xs text-muted">
                Cadastre os códigos CID-10 usados na emissão de atestados.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                aria-label="Buscar CID"
                value={busca}
                onChange={(e) => onBuscaChange(e.target.value)}
                placeholder="Buscar CID..."
                className="pl-9 sm:w-64"
              />
            </div>
            <Button type="button" variant="primary" onClick={abrirNovo}>
              <Plus className="h-4 w-4" /> Novo CID
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-muted-surface text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="w-32 px-4 py-3">Código</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="w-24 px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {visiveis.map((c) => (
                  <motion.tr
                    key={c.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="border-b border-line last:border-0 transition-colors hover:bg-muted-surface/60"
                  >
                    <td className="px-4 py-3">
                      <span className="inline-flex shrink-0 items-center rounded-md bg-brand-50 px-2 py-1 font-mono text-xs font-semibold text-brand-700">
                        {c.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {c.description}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => abrirEdicao(c)}
                          disabled={pending}
                          aria-label={`Editar ${c.code}`}
                          className="rounded-lg p-2 text-muted transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remover(c)}
                          disabled={pending}
                          aria-label={`Remover ${c.code}`}
                          className="rounded-lg p-2 text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>

              {visiveis.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-12 text-center text-sm text-muted"
                  >
                    {buscando
                      ? "Nenhum CID encontrado."
                      : "Nenhum CID cadastrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filtradas.length > 0 && (
          <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs text-muted">
              Mostrando {inicio + 1} a{" "}
              {Math.min(inicio + POR_PAGINA, filtradas.length)} de{" "}
              {filtradas.length}{" "}
              {filtradas.length === 1 ? "registro" : "registros"}
            </p>
            {totalPaginas > 1 && (
              <div className="flex flex-wrap items-center gap-1 justify-center">
                <button
                  type="button"
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={paginaSegura === 1}
                  aria-label="Página anterior"
                  className="rounded-lg border border-line p-2 text-muted transition-colors hover:bg-muted-surface disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {(() => {
                  let startPage = Math.max(1, paginaSegura - 2);
                  let endPage = Math.min(totalPaginas, startPage + 4);
                  if (endPage - startPage < 4) {
                    startPage = Math.max(1, endPage - 4);
                  }

                  const pages = [];
                  if (startPage > 1) {
                    pages.push(1);
                    if (startPage > 2) pages.push("...");
                  }

                  for (let i = startPage; i <= endPage; i++) {
                    pages.push(i);
                  }

                  if (endPage < totalPaginas) {
                    if (endPage < totalPaginas - 1) pages.push("...");
                    pages.push(totalPaginas);
                  }

                  return pages.map((p, idx) => {
                    if (p === "...") {
                      return (
                        <span key={`dots-${idx}`} className="px-1 text-muted">
                          ...
                        </span>
                      );
                    }
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPagina(p as number)}
                        aria-label={`Página ${p}`}
                        aria-current={p === paginaSegura ? "page" : undefined}
                        className={
                          p === paginaSegura
                            ? "h-9 min-w-9 rounded-lg bg-brand-500 px-2 text-sm font-medium text-white"
                            : "h-9 min-w-9 rounded-lg border border-line px-2 text-sm font-medium text-muted transition-colors hover:bg-muted-surface hover:text-ink"
                        }
                      >
                        {p}
                      </button>
                    );
                  });
                })()}

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

      <Modal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        title={editId === null ? "Novo CID" : "Editar CID"}
        subtitle={
          editId === null
            ? "Cadastre um novo CID."
            : "Atualize os dados do CID."
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
            <Button
              type="button"
              variant="primary"
              onClick={salvar}
              disabled={pending}
            >
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            id="cid-code"
            label="Código"
            value={draft.code}
            onChange={(e) =>
              setDraft((d) => ({ ...d, code: e.target.value }))
            }
            placeholder="Ex.: J11"
            required
            autoFocus
          />
          <label htmlFor="cid-desc" className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Descrição
            </span>
            <textarea
              id="cid-desc"
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
              placeholder="Ex.: Influenza (gripe)"
              rows={3}
              maxLength={500}
              className="w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </div>
      </Modal>
    </Card>
  );
}
