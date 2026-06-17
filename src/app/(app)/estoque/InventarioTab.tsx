"use client";

import { useMemo, useState, useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Boxes, Save, Lock } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import {
  type ItemInventario,
  type InventarioAberto,
  type ContagemLinha,
} from "@/lib/data/stock";
import {
  abrirInventario,
  salvarContagem,
  fecharInventario,
} from "@/lib/actions/stock";

/** Edição local de uma linha: as 3 contagens como string (campo controlado). */
type Edicao = Record<string, [string, string, string]>;

export function InventarioTab({
  itens,
  inventarios,
}: {
  itens: ItemInventario[];
  inventarios: InventarioAberto[];
}) {
  const [tipo, setTipo] = useState<"geral" | "parcial">("geral");
  const [categoria, setCategoria] = useState("");
  const [state, formAction, pending] = useActionState(abrirInventario, undefined);
  const router = useRouter();

  const categorias = useMemo(
    () => Array.from(new Set(itens.map((i) => i.categoria))).sort(),
    [itens],
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success("Inventário aberto.");
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Inventário</h2>
          <p className="text-sm text-muted">
            Contagem geral ou parcial com até 3 conferências
          </p>
        </div>

        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <Select
              name="kind"
              label="Tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "geral" | "parcial")}
            >
              <option value="geral">Geral</option>
              <option value="parcial">Parcial</option>
            </Select>
          </div>
          {tipo === "parcial" && (
            <div className="w-48">
              <Select
                name="category"
                label="Categoria"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
              >
                <option value="">Selecione</option>
                {categorias.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </div>
          )}
          <Button type="submit" disabled={pending}>
            <ClipboardCheck className="h-4 w-4" />
            {pending ? "Abrindo..." : "Abrir Inventário"}
          </Button>
        </form>
      </div>

      {inventarios.length === 0 ? (
        <Card className="mt-4 p-12 text-center text-muted">
          <Boxes className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Nenhum inventário aberto. Abra um para iniciar a conferência.
        </Card>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {inventarios.map((inv) => (
            <InventarioCard key={inv.id} inv={inv} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Card de um inventário aberto: edição das contagens + salvar/fechar. */
function InventarioCard({ inv }: { inv: InventarioAberto }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [edicao, setEdicao] = useState<Edicao>(() => {
    const init: Edicao = {};
    for (const it of inv.itens) {
      init[it.id] = [
        it.contagem1?.toString() ?? "",
        it.contagem2?.toString() ?? "",
        it.contagem3?.toString() ?? "",
      ];
    }
    return init;
  });

  function setContagem(id: string, idx: 0 | 1 | 2, value: string) {
    setEdicao((prev) => {
      const atual = prev[id] ?? ["", "", ""];
      const next: [string, string, string] = [...atual] as [
        string,
        string,
        string,
      ];
      next[idx] = value;
      return { ...prev, [id]: next };
    });
  }

  /** Divergência: última contagem preenchida vs. saldo do sistema. */
  function divergencia(it: ContagemLinha): number | null {
    const c = edicao[it.id];
    if (!c) return null;
    const ultima = [c[2], c[1], c[0]].find((v) => v.trim() !== "");
    if (ultima === undefined) return null;
    return Number(ultima) - it.sistema;
  }

  function salvar() {
    startTransition(async () => {
      let erros = 0;
      for (const it of inv.itens) {
        const c = edicao[it.id] ?? ["", "", ""];
        const res = await salvarContagem({
          id: it.id,
          count_1: c[0],
          count_2: c[1],
          count_3: c[2],
        });
        if (res?.error) erros++;
      }
      if (erros > 0) {
        toast.error(`Falha ao salvar ${erros} linha(s).`);
      } else {
        toast.success("Contagens salvas.");
        router.refresh();
      }
    });
  }

  function fechar() {
    startTransition(async () => {
      const res = await fecharInventario(inv.id);
      if (res?.ok) {
        toast.success("Inventário fechado.");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível fechar o inventário.");
      }
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-ink">{inv.codigo}</h3>
          <Badge status={inv.tipo === "geral" ? "active" : "wait"}>
            {inv.tipo === "geral"
              ? "Geral"
              : `Parcial · ${inv.categoria ?? "—"}`}
          </Badge>
          <span className="text-xs text-muted">Aberto em {inv.criadoEm}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={salvar}>
            <Save className="h-4 w-4" /> Salvar contagens
          </Button>
          <Button variant="danger" size="sm" disabled={pending} onClick={fechar}>
            <Lock className="h-4 w-4" /> Fechar
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-5 py-3 font-medium">Produto</th>
              <th className="px-5 py-3 font-medium">Sistema</th>
              <th className="px-5 py-3 font-medium">1ª Contagem</th>
              <th className="px-5 py-3 font-medium">2ª Contagem</th>
              <th className="px-5 py-3 font-medium">3ª Contagem</th>
              <th className="px-5 py-3 font-medium">Divergência</th>
            </tr>
          </thead>
          <tbody>
            {inv.itens.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-muted">
                  Sem itens no escopo deste inventário.
                </td>
              </tr>
            ) : (
              inv.itens.map((it) => {
                const c = edicao[it.id] ?? ["", "", ""];
                const div = divergencia(it);
                return (
                  <tr key={it.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-medium text-ink">
                      {it.produto}
                    </td>
                    <td className="px-5 py-3 text-ink">{it.sistema}</td>
                    {[0, 1, 2].map((idx) => (
                      <td key={idx} className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          value={c[idx]}
                          onChange={(e) =>
                            setContagem(it.id, idx as 0 | 1 | 2, e.target.value)
                          }
                          placeholder="—"
                          className="h-9 w-20 rounded-lg border border-line bg-white px-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        />
                      </td>
                    ))}
                    <td className="px-5 py-3">
                      {div === null ? (
                        <span className="text-muted">—</span>
                      ) : div === 0 ? (
                        <Badge status="ok">OK</Badge>
                      ) : (
                        <Badge status={div > 0 ? "warn" : "danger"}>
                          {div > 0 ? `+${div}` : div}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
