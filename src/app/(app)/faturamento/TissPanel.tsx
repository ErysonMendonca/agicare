"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileCheck2,
  AlertTriangle,
  XCircle,
  FileCode2,
  Layers,
  TrendingDown,
  TrendingUp,
  Lock,
  CheckCircle2,
  Ban,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { EmBreve } from "@/components/ui/EmBreve";
import { type GuiaTISS, type LoteTISS } from "@/lib/data/billing";
import { baixarArquivoXML } from "@/lib/faturamento-tiss";
import { gerarLoteXML, conciliarGuia, validarGuia } from "./actions";

/** Rótulo do veredito de validação para o toast. */
const validacaoLabel: Record<GuiaTISS["validacao"], string> = {
  validada: "Validada",
  alerta: "Com Alerta",
  erro: "Com Erro",
};

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

const validacaoIcon = {
  validada: <FileCheck2 className="h-4 w-4 text-green-600" />,
  alerta: <AlertTriangle className="h-4 w-4 text-orange-500" />,
  erro: <XCircle className="h-4 w-4 text-red-500" />,
} as const;

export function TissPanel({
  guias,
  lotes,
  gestor,
}: {
  guias: GuiaTISS[];
  lotes: LoteTISS[];
  gestor: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [conciliar, setConciliar] = useState<GuiaTISS | null>(null);
  const [validandoId, setValidandoId] = useState<string | null>(null);
  const router = useRouter();

  // Contas a receber: aprovados (validadas) vs. glosados (com erro).
  const aprovados = guias
    .filter((g) => g.validacao === "validada")
    .reduce((acc, g) => acc + g.valorNumerico, 0);
  const glosados = guias
    .filter((g) => g.validacao === "erro")
    .reduce((acc, g) => acc + g.valorNumerico, 0);

  function handleValidar(g: GuiaTISS) {
    setValidandoId(g.id);
    startTransition(async () => {
      // Snapshot p/ o modo demo; em modo real o servidor relê do banco.
      const res = await validarGuia(g.id, {
        temPaciente: g.paciente !== "—",
        insurance: g.convenio === "—" ? null : g.convenio,
        procedure_code: g.procedimento === "—" ? null : g.procedimento,
        amount: g.valorNumerico,
        validation_note: g.observacao,
      });
      setValidandoId(null);
      if (res?.ok) {
        const label = res.validacao ? validacaoLabel[res.validacao] : "concluída";
        const msg = `Guia ${g.numero} validada — ${label}.`;
        if (res.validacao === "erro") toast.error(msg);
        else if (res.validacao === "alerta") toast.warning(msg);
        else toast.success(msg);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível validar a guia.");
      }
    });
  }

  function handleGerarLote(lote: LoteTISS) {
    if (lote.guias === 0) {
      toast.error("O lote não possui guias para gerar o XML.");
      return;
    }
    startTransition(async () => {
      const res = await gerarLoteXML(lote.id);
      if (res?.ok && res.xml) {
        baixarArquivoXML(res.nomeArquivo ?? lote.codigo, res.xml);
        toast.success(`Lote ${lote.codigo} gerado — XML TISS baixado.`);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível gerar o lote.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Contas a Receber (gestor) */}
      {gestor ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="border-green-200 bg-green-50 p-5">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <TrendingUp className="h-4 w-4" /> Aprovados (a receber)
            </div>
            <div className="mt-2 text-2xl font-bold text-green-700">
              {formatBRL(aprovados)}
            </div>
          </Card>
          <Card className="border-red-200 bg-red-50 p-5">
            <div className="flex items-center gap-2 text-sm text-red-700">
              <TrendingDown className="h-4 w-4" /> Glosados
            </div>
            <div className="mt-2 text-2xl font-bold text-red-700">
              {formatBRL(glosados)}
            </div>
          </Card>
        </div>
      ) : (
        <Card className="flex items-center gap-2 p-5 text-sm text-muted">
          <Lock className="h-4 w-4" /> Conciliação e contas a receber restritas ao
          gestor.
        </Card>
      )}

      {/* Validação + Conciliação de guias */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileCheck2 className="h-5 w-5 text-brand-600" />
          <h3 className="text-base font-semibold text-ink">
            Validação & Conciliação de Guias
          </h3>
        </div>

        {guias.length > 0 ? (
          <div className="flex flex-col gap-3">
            {guias.map((g) => (
              <div
                key={g.id}
                className="flex flex-col gap-3 rounded-xl border border-line p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {validacaoIcon[g.validacao]}
                    <span className="font-mono text-sm font-semibold text-ink">
                      {g.numero}
                    </span>
                    <Badge status={g.status.tone}>{g.status.label}</Badge>
                    <span className="inline-flex items-center rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium text-muted">
                      {g.convenio}
                    </span>
                  </div>
                  <div className="mt-1.5 text-sm text-muted">
                    {g.paciente} ·{" "}
                    <span className="text-ink">{g.procedimento}</span>
                  </div>
                  {g.observacao && (
                    <div className="mt-1 text-xs text-orange-600">
                      {g.observacao}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 lg:flex-none">
                  <span className="text-sm font-semibold text-brand-600">
                    {gestor ? g.valor : "—"}
                  </span>
                  <span className="text-xs text-muted">
                    {g.loteCodigo ?? "Sem lote"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => handleValidar(g)}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {validandoId === g.id ? "Validando..." : "Validar"}
                  </Button>
                  {gestor && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConciliar(g)}
                    >
                      Conciliar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted">
            Nenhuma guia para validar.
          </p>
        )}
      </Card>

      {/* Lotes TISS */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Layers className="h-5 w-5 text-brand-600" />
          <h3 className="text-base font-semibold text-ink">Lotes TISS</h3>
          <EmBreve label="Em breve — XML oficial ANS (assinado)" />
        </div>

        <EmBreve
          variant="banner"
          className="mb-4"
          label="O XML gerado segue um padrão simplificado para conferência local. A geração do XML TISS oficial da ANS (schema completo + assinatura) e a transmissão à operadora serão habilitadas em breve."
        />

        {lotes.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {lotes.map((lote) => (
              <div
                key={lote.id}
                className="rounded-xl border border-line p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-ink">
                    {lote.codigo}
                  </span>
                  <Badge status={lote.status.tone}>{lote.status.label}</Badge>
                </div>
                <div className="mt-2 text-sm text-muted">
                  {lote.convenio} · {lote.guias} guia(s)
                </div>
                <div className="mt-1 text-sm font-semibold text-brand-600">
                  {gestor ? lote.valor : "—"}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  disabled={pending}
                  onClick={() => handleGerarLote(lote)}
                >
                  <FileCode2 className="h-4 w-4" />
                  {lote.xmlGerado ? "Baixar XML novamente" : "Gerar Lote XML"}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted">
            Nenhum lote criado.
          </p>
        )}
      </Card>

      {conciliar && gestor && (
        <ConciliarModal
          guia={conciliar}
          open={!!conciliar}
          onClose={() => setConciliar(null)}
        />
      )}
    </div>
  );
}

/** Modal de conciliação: aceitar a guia ou registrar glosa (valor + motivo). */
function ConciliarModal({
  guia,
  open,
  onClose,
}: {
  guia: GuiaTISS;
  open: boolean;
  onClose: () => void;
}) {
  const [resultado, setResultado] = useState<"aceita" | "glosa">("aceita");
  const [valor, setValor] = useState(String(guia.valorNumerico));
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleConfirmar() {
    const valorNum = Math.max(0, Number(valor.replace(",", ".")) || 0);
    startTransition(async () => {
      const res = await conciliarGuia(
        guia.id,
        resultado,
        resultado === "glosa" ? valorNum : 0,
        resultado === "glosa" ? motivo : undefined,
      );
      if (res?.ok) {
        toast.success(
          resultado === "glosa"
            ? "Glosa registrada na guia."
            : "Guia conciliada (aceita).",
        );
        router.refresh();
        onClose();
      } else {
        toast.error(res?.error ?? "Não foi possível conciliar a guia.");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Conciliação de Guia"
      subtitle={`${guia.numero} · ${guia.convenio}`}
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={pending}>
            <CheckCircle2 className="h-4 w-4" /> Confirmar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setResultado("aceita")}
          className={
            "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors " +
            (resultado === "aceita"
              ? "border-green-300 bg-green-50 text-green-700"
              : "border-line text-ink hover:bg-black/5")
          }
        >
          <CheckCircle2 className="h-4 w-4" /> Aceitar
        </button>
        <button
          type="button"
          onClick={() => setResultado("glosa")}
          className={
            "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors " +
            (resultado === "glosa"
              ? "border-red-300 bg-red-50 text-red-600"
              : "border-line text-ink hover:bg-black/5")
          }
        >
          <Ban className="h-4 w-4" /> Registrar glosa
        </button>
      </div>

      {resultado === "glosa" && (
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Valor glosado (R$)
            <Input
              type="text"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-40"
              aria-label="Valor glosado"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Motivo da glosa
            <Input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: divergência de código TUSS"
              aria-label="Motivo da glosa"
            />
          </label>
        </div>
      )}

      {resultado === "aceita" && (
        <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
          A guia será marcada como validada e o valor confirmado nas contas a
          receber.
        </p>
      )}
    </Modal>
  );
}
