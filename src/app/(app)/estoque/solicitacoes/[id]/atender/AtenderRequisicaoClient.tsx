"use client";

import { useMemo, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Barcode, Check, Printer, History, Copy, Filter } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge, type Status } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  registrarAtendimento,
  replicarSolicitacao,
} from "@/lib/actions/product-requests";
import { type SolicitacaoProduto } from "@/lib/data/product-requests.shared";
import { type ProdutoEstoque } from "@/lib/data/stock";
import { type AtendimentoHistorico } from "@/lib/data/product-requests";
import {
  imprimirAtendimentoRequisicao,
  type ClinicaImpressao,
} from "./AtendimentoRequisicaoImpressao";

type Linha = {
  itemId: string;
  productId: string | null;
  nome: string;
  unidade: string;
  requisitada: number;
  /** Já persistido no banco ANTES desta sessão de atendimento. */
  atendidaAcumulada: number;
  /** Quantidade a dar baixa AGORA (texto controlado — digitação livre). */
  atenderAgora: string;
  /** Campo de bipagem desta linha. */
  barcode: string;
};

/** Situação da LINHA (não da solicitação inteira) a partir do requisitado x atendido. */
function situacaoLinha(
  requisitada: number,
  atendidaTotal: number,
): { label: string; tone: Status } {
  if (atendidaTotal <= 0) return { label: "Pendente", tone: "warn" };
  if (atendidaTotal + 0.001 < requisitada) return { label: "Parcial", tone: "wait" };
  return { label: "Completo", tone: "active" };
}

/**
 * Página de atendimento de uma Solicitação de Produtos: lista os itens com
 * Requisitada/Atendida/Pendente, permite dar baixa digitando OU bipando o
 * código de barras do produto na própria linha (cada leitura soma 1 unidade,
 * até o limite do pendente). Suporta atendimento PARCIAL — "Salvar" registra
 * o progresso e mantém a tela aberta; "Encerrar Atendimento" registra e volta
 * para a lista (a solicitação continua na fila como "Parcial" se sobrar
 * pendência, ou vira "Atendida" se tudo foi dado baixa).
 */
export function AtenderRequisicaoClient({
  solicitacao,
  produtos,
  clinica,
  historico,
  atendenteNome,
}: {
  solicitacao: SolicitacaoProduto;
  produtos: ProdutoEstoque[];
  clinica: ClinicaImpressao;
  historico: AtendimentoHistorico[];
  atendenteNome: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [somenteAtendidos, setSomenteAtendidos] = useState(false);

  const produtoPorId = useMemo(
    () => new Map(produtos.map((p) => [p.id, p])),
    [produtos],
  );
  const produtoPorBarcode = useMemo(() => {
    const m = new Map<string, ProdutoEstoque>();
    for (const p of produtos) if (p.barcode) m.set(p.barcode.trim(), p);
    return m;
  }, [produtos]);

  const [linhas, setLinhas] = useState<Linha[]>(() =>
    solicitacao.itens.map((it) => ({
      itemId: it.id,
      productId: it.productId,
      nome: it.nome,
      unidade: it.unidade,
      requisitada: it.quantidade,
      atendidaAcumulada: it.quantidadeAtendida,
      atenderAgora: "",
      barcode: "",
    })),
  );

  function setLinha(itemId: string, patch: Partial<Linha>) {
    setLinhas((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)),
    );
  }

  function pendenteDaLinha(l: Linha): number {
    return Math.max(0, l.requisitada - l.atendidaAcumulada);
  }

  function somarNaLinha(l: Linha, delta: number) {
    const atual = Number(l.atenderAgora.replace(",", ".")) || 0;
    const max = pendenteDaLinha(l);
    const novo = Math.min(max, Math.max(0, atual + delta));
    setLinha(l.itemId, { atenderAgora: novo === 0 ? "" : String(novo) });
  }

  /** Bipagem: Enter no campo de código de barras confere o produto da linha e
   * soma 1 unidade (até o limite do pendente). Não confere → erro, não soma. */
  function onBarcodeKeyDown(l: Linha, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const codigo = l.barcode.trim();
    if (!codigo) return;

    const prod = produtoPorBarcode.get(codigo);
    if (!prod) {
      toast.error("Código de barras não encontrado no catálogo de produtos.");
      setLinha(l.itemId, { barcode: "" });
      return;
    }
    const esperado = l.productId ? produtoPorId.get(l.productId) : undefined;
    if (esperado && prod.id !== esperado.id) {
      toast.error(`Código não confere com o produto desta linha ("${l.nome}").`);
      setLinha(l.itemId, { barcode: "" });
      return;
    }
    if (pendenteDaLinha(l) <= 0) {
      toast.error("Este item já está com a quantidade solicitada completa.");
      setLinha(l.itemId, { barcode: "" });
      return;
    }
    somarNaLinha(l, 1);
    setLinha(l.itemId, { barcode: "" });
  }

  const linhasVisiveis = somenteAtendidos
    ? linhas.filter((l) => l.atendidaAcumulada > 0)
    : linhas;

  function montarItensParaEnvio() {
    return linhas
      .map((l) => ({
        itemId: l.itemId,
        product_id: l.productId ?? "",
        quantity_num: Number(l.atenderAgora.replace(",", ".")) || 0,
      }))
      .filter((i) => i.quantity_num > 0 && i.product_id);
  }

  function salvar(encerrar: boolean) {
    const itens = montarItensParaEnvio();
    if (itens.length === 0) {
      toast.error(
        "Informe ao menos uma quantidade (digitando ou bipando) para atender.",
      );
      return;
    }
    startTransition(async () => {
      const res = await registrarAtendimento({
        requestId: solicitacao.id,
        items: itens,
      });
      if (res?.ok) {
        toast.success(encerrar ? "Atendimento registrado." : "Progresso salvo.");
        if (encerrar) {
          router.push("/estoque?aba=solicitacoes");
        } else {
          setLinhas((prev) =>
            prev.map((l) => {
              const enviado = itens.find((i) => i.itemId === l.itemId);
              return enviado
                ? {
                    ...l,
                    atendidaAcumulada: l.atendidaAcumulada + enviado.quantity_num,
                    atenderAgora: "",
                  }
                : l;
            }),
          );
          router.refresh();
        }
      } else {
        toast.error(res?.error ?? "Não foi possível registrar o atendimento.");
      }
    });
  }

  function imprimir() {
    imprimirAtendimentoRequisicao(
      clinica,
      {
        codigo: solicitacao.codigo,
        setorSolicitante: solicitacao.setor,
        setorFornecedor: solicitacao.setorFornecedor ?? "—",
        solicitante: solicitacao.solicitante,
        situacao: solicitacao.status.label,
        motivo: solicitacao.observacoes || "Consumo / uso interno",
      },
      linhas.map((l) => {
        const prod = l.productId ? produtoPorId.get(l.productId) : undefined;
        return {
          produto: l.nome,
          unidade: l.unidade,
          solicitada: l.requisitada,
          atendida: l.atendidaAcumulada,
          lote: prod?.lote && prod.lote !== "—" ? prod.lote : "",
          validade: prod?.validade && prod.validade !== "—" ? prod.validade : "",
          situacao: situacaoLinha(l.requisitada, l.atendidaAcumulada).label,
        };
      }),
      atendenteNome,
    );
  }

  function replicar() {
    startTransition(async () => {
      const res = await replicarSolicitacao(solicitacao.id);
      if (res?.ok) {
        toast.success("Nova solicitação criada com os mesmos itens.");
        router.push("/estoque?aba=solicitacoes");
      } else {
        toast.error(res?.error ?? "Não foi possível replicar a solicitação.");
      }
    });
  }

  const jaConcluida =
    solicitacao.statusRaw === "atendida" || solicitacao.statusRaw === "cancelada";

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            {solicitacao.urgente && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                Urgente
              </span>
            )}
            <Badge status={solicitacao.status.tone}>{solicitacao.status.label}</Badge>
            <span>
              Solicitante: {solicitacao.solicitante} · {solicitacao.criadaEm}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSomenteAtendidos((v) => !v)}
            >
              <Filter className="h-4 w-4" />
              {somenteAtendidos ? "Ver todos" : "Só produtos atendidos"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMostrarHistorico((v) => !v)}
            >
              <History className="h-4 w-4" /> Histórico
            </Button>
            <Button variant="outline" size="sm" onClick={imprimir}>
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
            <Button variant="outline" size="sm" onClick={replicar} disabled={pending}>
              <Copy className="h-4 w-4" /> Replicar
            </Button>
          </div>
        </div>
        {solicitacao.observacoes && (
          <p className="mt-2 text-xs text-muted">Obs.: {solicitacao.observacoes}</p>
        )}
      </Card>

      {mostrarHistorico && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium text-ink">
            Histórico de atendimentos
          </p>
          {historico.length === 0 ? (
            <p className="text-sm text-muted">
              Nenhum atendimento registrado ainda para esta solicitação.
            </p>
          ) : (
            <ul className="space-y-2">
              {historico.map((h) => (
                <li key={h.id} className="rounded-lg border border-line p-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink">{h.codigo}</span>
                    <span className="text-xs text-muted">{h.criadoEm}</span>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted">
                    {h.itens.map((it, idx) => (
                      <li key={idx}>
                        {it.nome} — {it.quantidade} {it.unidade}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-xs uppercase text-muted">
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2 text-center">Requisitada</th>
              <th className="px-3 py-2 text-center">Atendida</th>
              <th className="px-3 py-2 text-center">Pendente</th>
              <th className="px-3 py-2">Atender</th>
              <th className="px-3 py-2">Código de barras</th>
              <th className="px-3 py-2">Situação</th>
            </tr>
          </thead>
          <tbody>
            {linhasVisiveis.map((l) => {
              const pendente = pendenteDaLinha(l);
              const sit = situacaoLinha(l.requisitada, l.atendidaAcumulada);
              const semVinculo = !l.productId;
              const bloqueada = jaConcluida || semVinculo || pendente <= 0;
              return (
                <tr key={l.itemId} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink">{l.nome}</div>
                    <div className="text-xs text-muted">{l.unidade}</div>
                    {semVinculo && (
                      <div className="text-xs text-amber-700">
                        Sem produto de estoque vinculado
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">{l.requisitada}</td>
                  <td className="px-3 py-2 text-center">{l.atendidaAcumulada}</td>
                  <td className="px-3 py-2 text-center font-medium">{pendente}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      max={pendente}
                      step="0.01"
                      value={l.atenderAgora}
                      disabled={bloqueada}
                      placeholder="0"
                      className="w-24"
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") {
                          setLinha(l.itemId, { atenderAgora: "" });
                          return;
                        }
                        const v = Number(raw.replace(",", "."));
                        if (!Number.isFinite(v)) return;
                        const clamped = Math.min(pendente, Math.max(0, v));
                        setLinha(l.itemId, { atenderAgora: String(clamped) });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="relative w-40">
                      <Barcode className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                      <Input
                        value={l.barcode}
                        disabled={bloqueada}
                        placeholder="Bipar código..."
                        className="pl-7"
                        onChange={(e) => setLinha(l.itemId, { barcode: e.target.value })}
                        onKeyDown={(e) => onBarcodeKeyDown(l, e)}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge status={sit.tone}>{sit.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/estoque?aba=solicitacoes"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink transition-colors hover:bg-black/5"
        >
          Voltar
        </Link>
        {!jaConcluida && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => salvar(false)} disabled={pending}>
              Salvar
            </Button>
            <Button onClick={() => salvar(true)} disabled={pending}>
              <Check className="h-4 w-4" /> Encerrar Atendimento
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
