"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, FilePlus2, LogOut, Printer, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { type Documento } from "@/lib/data/documentos";
import { type CidCode } from "@/lib/data/cid";
import { emitirAtestado, darAlta } from "@/lib/actions/documentos";
import {
  imprimirAtestado,
  type ClinicaImpressao,
  type PacienteImpressao,
} from "./AtestadoImpressao";

type ModalKind = "atestado" | "alta" | null;

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DocumentosClient({
  patientId,
  documentos,
  temReceita,
  cidCodes,
  clinica,
  paciente,
}: {
  patientId: string;
  documentos: Documento[];
  temReceita: boolean;
  cidCodes: CidCode[];
  clinica: ClinicaImpressao;
  paciente: PacienteImpressao;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalKind>(null);

  // Atestado
  const [atestado, setAtestado] = useState({
    dias: "1",
    dataAtestado: hoje(),
    diagnostico: "",
    cid10: "",
    observacao: "",
    exibirCid: true,
  });

  // Alta
  const [alta, setAlta] = useState({ motivo: "", diagnostico: "", orientacoes: "" });

  function resetAtestado() {
    setAtestado({
      dias: "1",
      dataAtestado: hoje(),
      diagnostico: "",
      cid10: "",
      observacao: "",
      exibirCid: true,
    });
  }

  /** Fecha o modal do atestado zerando o formulário (evita reter dados). */
  function fecharAtestado() {
    resetAtestado();
    setModal(null);
  }

  function salvarAtestado() {
    startTransition(async () => {
      const res = await emitirAtestado({
        patientId,
        dias: Number(atestado.dias),
        dataAtestado: atestado.dataAtestado,
        diagnostico: atestado.diagnostico,
        cid10: atestado.cid10 || undefined,
        observacao: atestado.observacao || undefined,
        exibirCid: atestado.exibirCid,
      });
      if (res?.ok) {
        toast.success("Atestado emitido.");
        resetAtestado();
        setModal(null);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível emitir o atestado.");
      }
    });
  }

  function salvarAlta() {
    startTransition(async () => {
      const res = await darAlta({ patientId, ...alta });
      if (res?.ok) {
        toast.success("Alta registrada.");
        setModal(null);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível registrar a alta.");
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          disabled={!temReceita}
          onClick={() => window.print()}
          title={temReceita ? undefined : "Emita uma prescrição para imprimir a receita"}
        >
          <Printer className="h-4 w-4" /> Imprimir Receita
        </Button>
        <Button variant="outline" onClick={() => setModal("alta")}>
          <LogOut className="h-4 w-4" /> Registrar Alta
        </Button>
        <Button onClick={() => setModal("atestado")}>
          <FilePlus2 className="h-4 w-4" /> Novo Atestado
        </Button>
      </div>

      {documentos.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-5 py-16 text-center">
          <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted-surface text-muted">
            <FileText className="h-7 w-7" />
          </span>
          <p className="font-medium text-ink">Nenhum documento emitido</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            Atestados e altas emitidos para este paciente aparecerão aqui.
          </p>
        </Card>
      ) : (
        <Stagger className="flex flex-col gap-3">
          {documentos.map((d) => {
            const isAtestado = d.tipo === "atestado";
            const mostraCid = isAtestado && d.exibirCid && !!d.cid10;
            return (
              <FadeInUp key={d.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge status={d.tipo === "alta" ? "ok" : "active"}>
                          {d.tipo === "alta" ? "Alta" : "Atestado"}
                        </Badge>
                        <span className="text-xs text-muted">{d.dataHora}</span>
                      </div>
                      {isAtestado ? (
                        <p className="text-sm text-ink">
                          {d.dias} dia(s) de afastamento
                          {d.inicio && d.fim
                            ? ` — de ${d.inicio} a ${d.fim}`
                            : d.dataAtestado
                              ? ` a partir de ${d.dataAtestado}`
                              : ""}
                          .{" "}
                          {d.diagnostico}
                          {mostraCid ? ` · CID-10: ${d.cid10}` : ""}
                          {d.observacao ? (
                            <span className="mt-1 block text-muted">{d.observacao}</span>
                          ) : null}
                        </p>
                      ) : (
                        <p className="text-sm text-ink">
                          <span className="font-medium">Motivo:</span> {d.motivo} ·{" "}
                          <span className="font-medium">Dx:</span> {d.diagnostico}
                          {d.orientacoes ? (
                            <span className="mt-1 block text-muted">{d.orientacoes}</span>
                          ) : null}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted">{d.profissional}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        isAtestado
                          ? imprimirAtestado(clinica, paciente, d)
                          : window.print()
                      }
                    >
                      <Printer className="h-4 w-4" /> Imprimir
                    </Button>
                  </div>
                </Card>
              </FadeInUp>
            );
          })}
        </Stagger>
      )}

      {/* Modal Atestado */}
      <Modal
        open={modal === "atestado"}
        onClose={fecharAtestado}
        title="Novo Atestado"
        subtitle="O CID-10 é opcional por LGPD (sigilo do diagnóstico)."
        footer={
          <>
            <Button variant="outline" onClick={fecharAtestado}>
              Cancelar
            </Button>
            <Button onClick={salvarAtestado} disabled={pending}>
              {pending ? "Emitindo…" : "Emitir Atestado"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Data do atestado"
            type="date"
            value={atestado.dataAtestado}
            onChange={(e) =>
              setAtestado((a) => ({ ...a, dataAtestado: e.target.value }))
            }
          />
          <Input
            label="Dias de afastamento"
            type="number"
            min={1}
            value={atestado.dias}
            onChange={(e) => setAtestado((a) => ({ ...a, dias: e.target.value }))}
          />
        </div>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Diagnóstico</span>
          <textarea
            rows={2}
            value={atestado.diagnostico}
            onChange={(e) => setAtestado((a) => ({ ...a, diagnostico: e.target.value }))}
            placeholder="Descrição do diagnóstico..."
            className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <div className="mt-4">
          <Input
            id="atestado-cid"
            label="CID-10 (opcional)"
            list="cid-codes"
            value={atestado.cid10}
            onChange={(e) => setAtestado((a) => ({ ...a, cid10: e.target.value }))}
            placeholder="Busque por código ou descrição — ex.: J11"
          />
          <datalist id="cid-codes">
            {cidCodes.map((c) => (
              <option key={c.id} value={c.code}>
                {c.code} — {c.description}
              </option>
            ))}
          </datalist>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
            Pode ser omitido a pedido do paciente (LGPD).
          </p>
        </div>
        <label className="mt-4 flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={atestado.exibirCid}
            onChange={(e) =>
              setAtestado((a) => ({ ...a, exibirCid: e.target.checked }))
            }
            className="h-5 w-5 rounded border-line text-brand-500 focus:ring-brand-100"
          />
          <span className="text-sm text-ink">Exibir CID na impressão</span>
        </label>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Observação (opcional)
          </span>
          <textarea
            rows={2}
            value={atestado.observacao}
            onChange={(e) => setAtestado((a) => ({ ...a, observacao: e.target.value }))}
            placeholder="Observações adicionais para o atestado..."
            className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </Modal>

      {/* Modal Alta */}
      <Modal
        open={modal === "alta"}
        onClose={() => setModal(null)}
        title="Registrar Alta"
        subtitle="Motivo, diagnóstico principal e orientações pós-alta."
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarAlta} disabled={pending}>
              {pending ? "Salvando…" : "Registrar Alta"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Motivo da alta"
            value={alta.motivo}
            onChange={(e) => setAlta((a) => ({ ...a, motivo: e.target.value }))}
            placeholder="Ex.: Melhora clínica"
          />
          <Input
            label="Diagnóstico principal"
            value={alta.diagnostico}
            onChange={(e) => setAlta((a) => ({ ...a, diagnostico: e.target.value }))}
            placeholder="Diagnóstico de encerramento"
          />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Orientações pós-alta
            </span>
            <textarea
              rows={3}
              value={alta.orientacoes}
              onChange={(e) => setAlta((a) => ({ ...a, orientacoes: e.target.value }))}
              placeholder="Cuidados, retorno, sinais de alerta..."
              className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </div>
      </Modal>
    </>
  );
}
