"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, X, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/lib/store/confirm";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { CidCode } from "@/lib/data/cid";
import { addCid, updateCid, removeCid } from "@/lib/actions/cid";

/**
 * Tela dedicada do "Catálogo CID": lista, adiciona, edita e remove os códigos
 * CID-10 globais usados na emissão de atestados. Dois campos por item — Código
 * e Descrição. Autorização real no servidor (gestor); RLS como 2ª camada.
 */
export function CidConfig({ cids }: { cids: CidCode[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  // Formulário de adição.
  const [novoCodigo, setNovoCodigo] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");

  // Edição inline.
  const [editId, setEditId] = useState<string | null>(null);
  const [editCodigo, setEditCodigo] = useState("");
  const [editDescricao, setEditDescricao] = useState("");

  function refresh() {
    router.refresh();
  }

  function adicionar() {
    const code = novoCodigo.trim();
    const description = novaDescricao.trim();
    if (!code || !description) {
      toast.error("Informe o código e a descrição do CID.");
      return;
    }
    startTransition(async () => {
      const res = await addCid({ code, description });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("CID adicionado.");
      setNovoCodigo("");
      setNovaDescricao("");
      refresh();
    });
  }

  function iniciarEdicao(cid: CidCode) {
    setEditId(cid.id);
    setEditCodigo(cid.code);
    setEditDescricao(cid.description);
  }

  function salvarEdicao() {
    if (!editId) return;
    const code = editCodigo.trim();
    const description = editDescricao.trim();
    if (!code || !description) {
      toast.error("O código e a descrição são obrigatórios.");
      return;
    }
    startTransition(async () => {
      const res = await updateCid(editId, { code, description });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("CID atualizado.");
      setEditId(null);
      refresh();
    });
  }

  async function remover(cid: CidCode) {
    if (!(await confirm({ message: `Remover o CID "${cid.code}"? Esta ação não pode ser desfeita.`, danger: true, confirmLabel: "Remover" }))) return;
    startTransition(async () => {
      const res = await removeCid(cid.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("CID removido.");
      refresh();
    });
  }

  return (
    <Card className="max-w-3xl">
      <CardBody>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-ink">Catálogo CID</h3>
            <p className="text-xs text-muted">
              Cadastre os códigos CID-10 usados na emissão de atestados
            </p>
          </div>
        </div>

        {/* Lista dos CIDs */}
        <div className="space-y-2">
          {cids.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              Nenhum CID cadastrado.
            </p>
          ) : (
            cids.map((cid) => {
              const emEdicao = editId === cid.id;
              return (
                <div
                  key={cid.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3"
                >
                  {emEdicao ? (
                    <>
                      <Input
                        aria-label="Código do CID"
                        value={editCodigo}
                        onChange={(e) => setEditCodigo(e.target.value)}
                        className="w-full sm:w-32"
                        placeholder="Código"
                      />
                      <Input
                        aria-label="Descrição do CID"
                        value={editDescricao}
                        onChange={(e) => setEditDescricao(e.target.value)}
                        className="min-w-0 flex-1"
                        placeholder="Descrição"
                      />
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={salvarEdicao}
                        disabled={pending}
                        aria-label="Salvar edição"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditId(null)}
                        disabled={pending}
                        aria-label="Cancelar edição"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex shrink-0 items-center rounded-md bg-brand-50 px-2 py-1 font-mono text-xs font-semibold text-brand-700">
                        {cid.code}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-ink">
                          {cid.description}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => iniciarEdicao(cid)}
                        disabled={pending}
                        aria-label={`Editar ${cid.code}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remover(cid)}
                        disabled={pending}
                        aria-label={`Remover ${cid.code}`}
                      >
                        <Trash2 className="h-4 w-4 text-status-danger" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Adicionar novo CID */}
        <div className="mt-5 rounded-xl border border-line bg-muted-surface p-4">
          <h4 className="mb-3 text-sm font-semibold text-ink">Adicionar CID</h4>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input
              id="novo-cid-codigo"
              label="Código"
              value={novoCodigo}
              onChange={(e) => setNovoCodigo(e.target.value)}
              placeholder="Ex.: J11"
              className="sm:w-32"
            />
            <Input
              id="novo-cid-descricao"
              label="Descrição"
              value={novaDescricao}
              onChange={(e) => setNovaDescricao(e.target.value)}
              placeholder="Ex.: Influenza (gripe)"
              className="flex-1"
            />
            <Button
              type="button"
              variant="primary"
              onClick={adicionar}
              disabled={pending}
            >
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
