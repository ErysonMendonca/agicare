"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CreditCard,
  Building2,
  ShieldCheck,
  Lock,
  Loader2,
  QrCode,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import { EmBreve } from "@/components/ui/EmBreve";
import { qrToSvg } from "@/lib/integrations/qrcode";
import { type Evento, type ItemCheckout } from "@/lib/data/billing";
import {
  registrarCheckout,
  carregarItensCheckout,
  carregarCheckoutSalvo,
} from "./actions";

type Forma = "particular" | "convenio" | "empresa";
type Pagamento = "pix" | "cartao" | "boleto";

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

const formas: { id: Forma; label: string; icon: typeof CreditCard }[] = [
  { id: "particular", label: "Particular", icon: CreditCard },
  { id: "convenio", label: "Convênio (TISS)", icon: ShieldCheck },
  { id: "empresa", label: "Empresa", icon: Building2 },
];

const pagamentos: { id: Pagamento; label: string }[] = [
  { id: "pix", label: "PIX" },
  { id: "cartao", label: "Cartão" },
  { id: "boleto", label: "Boleto" },
];

export function ConferenciaModal({
  evento,
  podeAjustar,
  procedimentos,
  modo = "conferir",
  open,
  onClose,
}: {
  evento: Evento;
  podeAjustar: boolean;
  procedimentos: any[];
  /** conferir (pendente) | editar (regrava) | visualizar/imprimir (recibo read-only). */
  modo?: "conferir" | "editar" | "visualizar" | "imprimir";
  open: boolean;
  onClose: () => void;
}) {
  // Recibo já gravado (visualizar/imprimir/editar). Somente-leitura mostra direto.
  const somenteLeitura = modo === "visualizar" || modo === "imprimir";
  const [forma, setForma] = useState<Forma>(
    evento.tipo === "Particular" ? "particular" : "convenio",
  );
  const [pagamento, setPagamento] = useState<Pagamento>("pix");
  const [desconto, setDesconto] = useState("0");
  const [acrescimo, setAcrescimo] = useState("0");
  // Dados da NF + prazos quando o pagador é uma empresa conveniada.
  const [nfNumero, setNfNumero] = useState("");
  const [nfEmissao, setNfEmissao] = useState("");
  const [nfVencimento, setNfVencimento] = useState("");
  const [nfPrazos, setNfPrazos] = useState("");
  const [itens, setItens] = useState<ItemCheckout[]>([]);
  const [carregando, setCarregando] = useState(true);
  // QR PIX de DEMONSTRAÇÃO (sem PSP real). Gerado localmente a partir de um
  // payload textual simples — não é um BR Code EMV válido para pagamento.
  const [pixQr, setPixQr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const [novoItemProcedimento, setNovoItemProcedimento] = useState("");
  const [novoItemValor, setNovoItemValor] = useState("");

  // Data + total exibidos no recibo: os gravados (check-out salvo) ou os da
  // conferência nova. `totalSalvo` é o net_amount autoritativo (read-only).
  const [dataRecibo, setDataRecibo] = useState<string | null>(null);
  const [totalSalvo, setTotalSalvo] = useState<number | null>(null);

  // Carrega os itens: conferência nova (procedimentos do atendimento) OU o
  // check-out já gravado (editar/visualizar/imprimir → itens+forma+ajustes reais).
  useEffect(() => {
    let ativo = true;
    const carregar =
      modo === "conferir"
        ? carregarItensCheckout(
            evento.codigo,
            evento.servico,
            evento.valorNumerico,
          ).then((res) => {
            if (ativo) setItens(res.itens);
          })
        : carregarCheckoutSalvo(evento.codigo).then(({ recibo }) => {
            if (!ativo || !recibo) return;
            setItens(recibo.itens);
            setForma(recibo.forma);
            if (recibo.pagamento)
              setPagamento(recibo.pagamento as Pagamento);
            setDesconto(String(recibo.desconto));
            setAcrescimo(String(recibo.acrescimo));
            setDataRecibo(recibo.data);
            setTotalSalvo(recibo.total);
            // Repopula os dados da NF (pagador empresa) p/ não zerar ao salvar.
            setNfNumero(recibo.nfNumero);
            setNfEmissao(recibo.nfEmissao);
            setNfVencimento(recibo.nfVencimento);
            setNfPrazos(recibo.nfPrazos);
          });
    carregar.finally(() => {
      if (ativo) setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, [evento.codigo, evento.servico, evento.valorNumerico, modo]);

  // Auto-impressão quando aberto em modo "imprimir".
  useEffect(() => {
    if (modo !== "imprimir" || carregando) return;
    const t = setTimeout(() => imprimirRecibo(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, carregando]);

  const subtotal = itens.reduce((acc, i) => acc + i.valor * i.qtd, 0);
  const descontoNum = Math.max(0, Number(desconto.replace(",", ".")) || 0);
  const acrescimoNum = Math.max(0, Number(acrescimo.replace(",", ".")) || 0);
  const totalFinal = Math.max(0, subtotal - descontoNum + acrescimoNum);

  function adicionarItem() {
    const p = procedimentos.find((x) => x.codigo === novoItemProcedimento);
    if (!p) return;
    const val = Number(novoItemValor.replace(",", ".")) || 0;
    setItens((prev) => [
      ...prev,
      {
        source: "procedimento",
        tipo: "TUSS",
        codigo: p.codigo,
        descricao: p.nome,
        qtd: 1,
        valor: val,
      },
    ]);
    setNovoItemProcedimento("");
    setNovoItemValor("");
  }

  const [sucesso, setSucesso] = useState(false);

  /**
   * Imprime o recibo numa janela dedicada (copia os estilos da página), sem
   * trocar o DOM da app nem recarregar — preserva o estado da tela de faturamento.
   */
  function imprimirRecibo() {
    const printContent = document.getElementById("recibo-print");
    if (!printContent) return;
    const win = window.open("", "_blank", "width=820,height=720");
    if (!win) {
      toast.error("Habilite pop-ups para imprimir o recibo.");
      return;
    }
    const estilos = Array.from(
      document.querySelectorAll('link[rel="stylesheet"], style'),
    )
      .map((n) => n.outerHTML)
      .join("");
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Recibo · ${evento.codigo}</title>${estilos}</head><body>${printContent.innerHTML}</body></html>`,
    );
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 300);
  }

  function handleConfirmar() {
    startTransition(async () => {
      const res = await registrarCheckout({
        eventCode: evento.codigo,
        forma,
        pagamento: forma === "particular" ? pagamento : undefined,
        desconto: podeAjustar ? descontoNum : 0,
        acrescimo: podeAjustar ? acrescimoNum : 0,
        itens,
        empresa:
          forma === "empresa"
            ? {
                nfNumero: nfNumero.trim() || undefined,
                nfEmissao: nfEmissao || undefined,
                nfVencimento: nfVencimento || undefined,
                nfPrazos: nfPrazos.trim() || undefined,
              }
            : undefined,
      });
      if (res?.ok) {
        toast.success("Check-out conferido e faturado.");
        router.refresh();
        setSucesso(true);
      } else {
        toast.error(res?.error ?? "Não foi possível concluir o check-out.");
      }
    });
  }

  if (sucesso || somenteLeitura) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Recibo de Pagamento"
        subtitle={`${evento.paciente} · ${evento.codigo}`}
        className="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Fechar
            </Button>
            <Button onClick={imprimirRecibo}>
              <Printer className="h-4 w-4" />
              Imprimir Recibo
            </Button>
          </>
        }
      >
        <div id="recibo-print" className="p-6 bg-white text-ink print:p-0">
          <div className="text-center border-b border-line pb-4 mb-4">
            <h2 className="text-lg font-bold">RECIBO DE PAGAMENTO</h2>
            <p className="text-sm">AgiCare - Clínica Médica</p>
          </div>
          <div className="space-y-2 text-sm mb-6">
            <p><strong>Paciente:</strong> {evento.paciente}</p>
            <p><strong>Atendimento:</strong> {evento.codigo}</p>
            <p><strong>Data:</strong> {dataRecibo ?? new Date().toLocaleDateString("pt-BR")}</p>
          </div>
          <table className="w-full text-sm mb-6 border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left py-2 font-medium">Procedimento</th>
                <th className="text-right py-2 font-medium">Qtd</th>
                <th className="text-right py-2 font-medium">Valor Unit.</th>
                <th className="text-right py-2 font-medium">Valor Total</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i, idx) => (
                <tr key={idx} className="border-b border-line">
                  <td className="py-2">{i.descricao}</td>
                  <td className="text-right py-2">{i.qtd}</td>
                  <td className="text-right py-2">{formatBRL(i.valor)}</td>
                  <td className="text-right py-2">
                    {formatBRL(i.valor * i.qtd)}
                  </td>
                </tr>
              ))}
              {descontoNum > 0 && (
                <tr className="border-b border-line">
                  <td className="py-2 text-red-600" colSpan={3}>
                    Desconto
                  </td>
                  <td className="text-right py-2 text-red-600">-{formatBRL(descontoNum)}</td>
                </tr>
              )}
              {acrescimoNum > 0 && (
                <tr className="border-b border-line">
                  <td className="py-2 text-brand-600" colSpan={3}>
                    Acréscimo
                  </td>
                  <td className="text-right py-2 text-brand-600">{formatBRL(acrescimoNum)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className="font-bold py-2" colSpan={3}>
                  TOTAL PAGO
                </td>
                <td className="text-right font-bold py-2">
                  {formatBRL(
                    somenteLeitura && totalSalvo != null
                      ? totalSalvo
                      : totalFinal,
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
          <div className="text-sm">
            <p>
              <strong>Forma de Pagamento:</strong>{" "}
              <span className="uppercase">{forma === "particular" ? pagamento : forma}</span>
            </p>
            <p className="mt-12 text-center text-xs text-muted">Assinatura / Carimbo</p>
            <div className="mt-4 border-b border-ink w-64 mx-auto"></div>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modo === "editar" ? "Reabrir Check-out" : "Conferência de Check-out"}
      subtitle={`${evento.paciente} · ${evento.codigo}`}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={pending || carregando}>
            <CheckCircle2 className="h-4 w-4" />
            {modo === "editar" ? "Salvar alterações" : "Confirmar Check-out"}
          </Button>
        </>
      }
    >
      {/* Itens TUSS + materiais (reais do atendimento) */}
      <div>
        <h3 className="text-sm font-semibold text-ink">Itens conferidos</h3>
        <div className="mt-2 overflow-hidden rounded-xl border border-line">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando itens...
            </div>
          ) : itens.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted">
              Nenhum item faturável identificado no atendimento.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Tipo</th>
                  <th className="px-3 py-2 text-left font-medium">Código</th>
                  <th className="px-3 py-2 text-left font-medium">Descrição</th>
                  <th className="px-3 py-2 text-right font-medium">Qtd</th>
                  {podeAjustar && (
                    <th className="px-3 py-2 text-right font-medium">Valor</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {itens.map((i, idx) => (
                  <tr key={`${i.codigo}-${idx}`}>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          i.tipo === "TUSS"
                            ? "bg-blue-50 text-blue-600"
                            : "bg-purple-50 text-purple-600",
                        )}
                      >
                        {i.tipo}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted">
                      {i.codigo}
                    </td>
                    <td className="px-3 py-2 text-ink">{i.descricao}</td>
                    <td className="px-3 py-2 text-right text-ink">{i.qtd}</td>
                    {podeAjustar && (
                      <td className="px-3 py-2 text-right font-medium text-ink">
                        {formatBRL(i.valor)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          
          {/* Adicionar Item Manual */}
          {podeAjustar && !carregando && (
            <div className="mt-4 border-t border-line pt-4">
              <h4 className="text-xs font-semibold uppercase text-muted mb-2">
                Adicionar Item Manual
              </h4>
              <div className="flex flex-wrap items-end gap-2">
                <Select
                  value={novoItemProcedimento}
                  onChange={(e) => {
                    const p = procedimentos.find((x) => x.codigo === e.target.value);
                    setNovoItemProcedimento(e.target.value);
                    if (p) setNovoItemValor(p.precoNum.toString());
                  }}
                  className="flex-1"
                >
                  <option value="">Selecione um procedimento...</option>
                  {procedimentos.map((p) => (
                    <option key={p.codigo} value={p.codigo}>
                      {p.codigo} - {p.nome}
                    </option>
                  ))}
                </Select>
                <div className="w-24">
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="Valor"
                    value={novoItemValor}
                    onChange={(e) => setNovoItemValor(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={adicionarItem}
                  disabled={!novoItemProcedimento}
                >
                  Adicionar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ajustes (sem alterar o prontuário) */}
      {podeAjustar ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-ink">
            Ajustes (desconto / acréscimo)
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            Valores em reais. Não alteram o prontuário clínico.
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Desconto (R$)
              <Input
                type="text"
                inputMode="decimal"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                className="w-32"
                aria-label="Valor do desconto"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Acréscimo (R$)
              <Input
                type="text"
                inputMode="decimal"
                value={acrescimo}
                onChange={(e) => setAcrescimo(e.target.value)}
                className="w-32"
                aria-label="Valor do acréscimo"
              />
            </label>
            <div className="pb-2 text-sm text-muted">
              Subtotal {formatBRL(subtotal)} · Total{" "}
              <span className="font-semibold text-brand-600">
                {formatBRL(totalFinal)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-muted-surface px-4 py-3 text-sm text-muted">
          <Lock className="h-4 w-4" /> Você não tem permissão para ajustar
          valores.
        </div>
      )}

      {/* Bifurcação: forma de cobrança */}
      <div className="mt-5">
        <h3 className="text-sm font-semibold text-ink">Forma de cobrança</h3>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {formas.map((f) => {
            const Icon = f.icon;
            const ativo = forma === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setForma(f.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                  ativo
                    ? "border-brand-400 bg-brand-50 text-brand-700"
                    : "border-line text-ink hover:bg-black/5",
                )}
              >
                <Icon className="h-4 w-4" /> {f.label}
              </button>
            );
          })}
        </div>

        {forma === "particular" && (
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {pagamentos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPagamento(p.id)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    pagamento === p.id
                      ? "border-brand-400 bg-brand-50 text-brand-700"
                      : "border-line text-muted hover:bg-black/5",
                  )}
                >
                  {p.label}
                </button>
              ))}
              <EmBreve label="Em breve — cobrança via PSP (Pix/cartão/boleto)" />
            </div>
            <p className="text-xs text-muted">
              A forma de pagamento é registrada no check-out; a cobrança
              eletrônica junto ao PSP será habilitada em breve.
            </p>

            {/* Exemplo/demonstração de cobrança PIX (sem gateway real). */}
            {pagamento === "pix" && (
              <div className="mt-1 rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                    Exemplo / demonstração — sem gateway real
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() =>
                      setPixQr(
                        qrToSvg(
                          `PIX-DEMO|${evento.codigo}|BRL${totalFinal.toFixed(2)}`,
                          160,
                        ),
                      )
                    }
                  >
                    <QrCode className="h-4 w-4" /> Gerar cobrança PIX (exemplo)
                  </Button>
                </div>
                {pixQr && (
                  <div className="mt-3 flex items-center gap-4">
                    <span
                      className="inline-block h-40 w-40 flex-none"
                      // QR gerado localmente (SVG estático, sem dado externo).
                      dangerouslySetInnerHTML={{ __html: pixQr }}
                    />
                    <div className="text-sm">
                      <div className="text-xs text-muted">Valor da cobrança</div>
                      <div className="text-lg font-semibold text-brand-600">
                        {podeAjustar ? formatBRL(totalFinal) : "—"}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Escaneie para simular o pagamento. Este QR é apenas
                        ilustrativo e não realiza uma transação real.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {forma === "convenio" && (
          <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
            Será gerada uma guia TISS para inclusão em lote do convênio.
          </p>
        )}
        {forma === "empresa" && (
          <div className="mt-3 flex flex-col gap-3">
            <p className="rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-700">
              Faturamento consolidado em fatura mensal da empresa conveniada.
              Informe os dados da NF e os prazos de pagamento.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Número da NF
                <Input
                  type="text"
                  value={nfNumero}
                  onChange={(e) => setNfNumero(e.target.value)}
                  placeholder="Ex.: 000123"
                  aria-label="Número da nota fiscal"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Emissão da NF
                <Input
                  type="date"
                  value={nfEmissao}
                  onChange={(e) => setNfEmissao(e.target.value)}
                  aria-label="Data de emissão da nota fiscal"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Vencimento
                <Input
                  type="date"
                  value={nfVencimento}
                  onChange={(e) => setNfVencimento(e.target.value)}
                  aria-label="Vencimento da fatura"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Prazos / condições
                <Input
                  type="text"
                  value={nfPrazos}
                  onChange={(e) => setNfPrazos(e.target.value)}
                  placeholder="Ex.: 30/60/90 dias"
                  aria-label="Prazos e condições de pagamento"
                />
              </label>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
