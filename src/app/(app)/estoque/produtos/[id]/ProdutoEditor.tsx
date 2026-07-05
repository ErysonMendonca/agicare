"use client";

import { useState, useRef, useTransition, useEffect, Component, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";
import { Save, AlertTriangle, Trash2, ShieldAlert } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  createStockProduct,
  updateStockProduct,
  deleteStockProduct,
  type ActionState,
} from "@/lib/actions/stock";
import {
  setProdutoSelecoes,
  removeProductXyz,
  addProductXyz,
} from "@/lib/actions/stock-product-children";
import type { ProdutoCompleto, ProdutoChildren, ProductXyzClass } from "./types";
import type { AttendanceOptionsByCategory } from "@/lib/data/attendance-options.shared";
import type { ProdutoCatalogos } from "@/lib/data/produto-catalogos";

// Novos Componentes
import { DadosGerais } from "./components/DadosGerais";
import { ControlePrescricao } from "./components/ControlePrescricao";
import { EstoqueFinanceiro } from "./components/EstoqueFinanceiro";
import { Selecoes } from "./components/Selecoes";

// Error Boundary local para conter falhas caso algum dado venha corrompido
class LocalErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-status-danger bg-status-danger/10 p-8 text-center text-status-danger">
          <ShieldAlert className="mb-4 h-12 w-12" />
          <h2 className="mb-2 text-xl font-bold">Falha Crítica de Renderização</h2>
          <p className="text-sm">{this.state.error?.message}</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Recarregar Página
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

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

  // Intenção do submit
  const intentRef = useRef<"salvar" | "fechar">("salvar");
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<{ error?: string } | undefined>(undefined);

  // Toggle Ativo
  const [ativo, setAtivo] = useState(produto.active);

  // Multi-seleções
  const [selUnidades, setSelUnidades] = useState<string[]>(
    () => (childrenData?.units ?? []).map((u: any) => u.unitLabel)
  );
  const [selVias, setSelVias] = useState<string[]>(
    () => (childrenData?.routes ?? []).map((r: any) => r.routeLabel)
  );
  const [selPrincipios, setSelPrincipios] = useState<string[]>(
    () => (childrenData?.ingredients ?? []).map((i: any) => i.ingredientLabel)
  );
  const [selMarcas, setSelMarcas] = useState<string[]>(
    () => (childrenData?.brands ?? []).map((b: any) => b.brandLabel)
  );
  const [selLocais, setSelLocais] = useState<string[]>(
    () => (childrenData?.locations ?? []).map((l: any) => l.locationLabel)
  );

  const xyzInicial =
    (childrenData?.xyz ?? []).find((x: any) => x.active)?.xyzClass ??
    (childrenData?.xyz ?? [])[0]?.xyzClass ??
    "";
  const [selXyz, setSelXyz] = useState<ProductXyzClass | "">(xyzInicial);

  const [savingSel, startSaveSel] = useTransition();

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
    if (selXyz !== xyzInicial) {
      for (const x of childrenData?.xyz ?? []) {
        await removeProductXyz(x.id, id);
      }
      if (selXyz) {
        const xyzClass = selXyz.trim().charAt(0).toUpperCase();
        if (xyzClass === "X" || xyzClass === "Y" || xyzClass === "Z") {
          await addProductXyz({ productId: id, xyzClass: xyzClass as ProductXyzClass });
        }
      }
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || savingSel) return;
    setPending(true);
    setState(undefined);

    const formData = new FormData(e.currentTarget);

    try {
      const res = novo
        ? await createStockProduct(undefined, formData)
        : await updateStockProduct(undefined, formData);

      if (!res || res.error) {
        toast.error(res?.error ?? "Erro desconhecido.");
        setState({ error: res?.error ?? "Erro desconhecido." });
        setPending(false);
        return;
      }

      const id = novo ? res.id : produto.id;
      if (!id) {
        toast.error("Salvo com sucesso, mas o ID não foi retornado.");
        setPending(false);
        return;
      }

      const selOk = await persistSelecoes(id);

      toast.success(novo ? "Produto criado!" : "Produto atualizado!");

      if (intentRef.current === "fechar" || (novo && !selOk)) {
        router.push("/estoque");
      } else if (novo) {
        router.push(`/estoque/produtos/${id}`);
      } else {
        router.refresh();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Ocorreu um erro ao salvar o produto.");
      setState({ error: err.message || "Ocorreu um erro inesperado." });
    } finally {
      setPending(false);
    }
  }

  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, startDelete] = useTransition();

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
    <div className="space-y-4">
      <LocalErrorBoundary>
        <form id="form-produto" onSubmit={handleSubmit} className="space-y-4">
          {!novo && <input type="hidden" name="id" value={produto.id} />}
          <input type="hidden" name="active" value={ativo ? "true" : "false"} />

          <DadosGerais
            produto={produto}
            options={options}
            novo={novo}
            ativo={ativo}
            setAtivo={setAtivo}
          />
          
          <ControlePrescricao produto={produto} />
          
          <EstoqueFinanceiro produto={produto} gestor={gestor} />
          
          <Selecoes
            catalogos={catalogos}
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
          />

          {state?.error && (
            <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
              {state.error}
            </p>
          )}

          {/* Rodapé fixo de ações */}
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-4 border-t border-line bg-surface p-4 shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)] sm:px-6">
            {!novo ? (
              <Button
                type="button"
                variant="outline"
                className="text-status-danger hover:bg-status-danger/10 hover:text-status-danger"
                onClick={() => setConfirmDel(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </Button>
            ) : (
              <div />
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/estoque")}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={pending || savingSel}
                onClick={() => (intentRef.current = "salvar")}
              >
                <Save className="mr-2 h-4 w-4" />
                Salvar Produto
              </Button>
              <Button
                type="submit"
                variant="outline"
                disabled={pending || savingSel}
                onClick={() => (intentRef.current = "fechar")}
              >
                Salvar e Fechar
              </Button>
            </div>
          </div>

          <Modal
            open={confirmDel}
            onClose={() => setConfirmDel(false)}
            title="Excluir Produto"
            subtitle={`Tem certeza que deseja excluir "${produto.name}"? Esta ação não pode ser desfeita.`}
          >
            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDel(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                className="bg-status-danger hover:bg-status-danger/90"
                onClick={excluir}
                disabled={deleting}
              >
                {deleting ? "Excluindo..." : "Sim, Excluir"}
              </Button>
            </div>
          </Modal>
        </form>
      </LocalErrorBoundary>
    </div>
  );
}
