"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScrollText, Printer, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { cn } from "@/lib/utils";
import { DocumentActions } from "@/components/clinico/DocumentActions";
import { CancelarDocumentoModal } from "@/components/clinico/CancelarDocumentoModal";
import { emitirReceituario, editarReceituario } from "@/lib/actions/receituario";
import { cancelarDocumento } from "@/lib/actions/documento-cancelamento";
import type { Receituario } from "@/lib/data/receituario";
import type { CidCode } from "@/lib/data/cid";
import {
  imprimirReceituarioSimples,
  type ClinicaImpressao,
  type PacienteImpressao,
} from "./ReceituarioSimplesImpressao";
import {
  imprimirReceituarioEspecial,
  type PacienteImpressaoEspecial,
} from "./ReceituarioEspecialImpressao";

type Tipo = "simples" | "especial";

type Endereco = {
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
};

const PLACEHOLDER: Record<Tipo, string> = {
  simples:
    "Digite a prescrição livre — medicamentos, posologia, orientações...\nUma linha por item.",
  especial:
    "Digite a prescrição do medicamento sujeito a controle especial (Portaria 344/98)...\nUma linha por item.",
};

export function ReceituarioClient({
  patientId,
  clinica,
  paciente,
  endereco,
  receituarios,
  cidCodes,
  profissional,
}: {
  patientId: string;
  clinica: ClinicaImpressao;
  paciente: PacienteImpressao;
  endereco: Endereco;
  receituarios: Receituario[];
  cidCodes: CidCode[];
  profissional: { nome: string; conselho: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tipo, setTipo] = useState<Tipo>("simples");
  const [texto, setTexto] = useState("");
  const [cid10, setCid10] = useState("");
  const [exibirCid, setExibirCid] = useState(true);
  // Edição: id do receituário em edição (null = criação).
  const [editId, setEditId] = useState<string | null>(null);
  // Visualização read-only e cancelamento.
  const [viewRec, setViewRec] = useState<Receituario | null>(null);
  const [cancelRec, setCancelRec] = useState<Receituario | null>(null);

  /** Normaliza um CID p/ comparação: maiúsculo, sem espaço e sem ponto. */
  const normCid = (s: string) =>
    s.trim().toUpperCase().replace(/\s+/g, "").replace(/\./g, "");
  /** true se o CID digitado existe no catálogo do admin (cidCodes). */
  function cidNoCatalogo(input: string): boolean {
    const alvo = normCid(input);
    return cidCodes.some((c) => normCid(c.code) === alvo);
  }

  const pacienteEspecial: PacienteImpressaoEspecial = {
    nome: paciente.nome,
    registro: paciente.registro,
    endereco: [endereco.endereco, endereco.bairro].filter(Boolean).join(", "),
    cidade: endereco.cidade,
    uf: endereco.uf,
    cep: endereco.cep,
  };

  /** Dispara a impressão do conteúdo conforme o tipo (CID opcional). */
  function imprimir(t: Tipo, conteudo: string, cid = "") {
    if (t === "especial") {
      imprimirReceituarioEspecial(clinica, pacienteEspecial, conteudo, profissional, cid);
    } else {
      imprimirReceituarioSimples(clinica, paciente, conteudo, profissional, cid);
    }
  }

  const MSG_CID_INVALIDO =
    "CID-10 não encontrado no catálogo. Selecione um CID cadastrado em Configurações → Catálogo CID.";

  function salvar() {
    const conteudo = texto.trim();
    if (!conteudo) {
      toast.error("Escreva a prescrição antes de salvar.");
      return;
    }
    if (cid10.trim() && !cidNoCatalogo(cid10)) {
      toast.error(MSG_CID_INVALIDO);
      return;
    }
    const payload = {
      patientId,
      tipo,
      texto: conteudo,
      cid10: cid10.trim() || undefined,
      exibirCid,
    };
    startTransition(async () => {
      const res = editId
        ? await editarReceituario({ ...payload, id: editId })
        : await emitirReceituario(payload);
      if (res?.ok) {
        toast.success(editId ? "Receituário atualizado." : "Receituário emitido.");
        limparEditor();
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível salvar o receituário.");
      }
    });
  }

  /** Limpa o editor e sai do modo de edição. */
  function limparEditor() {
    setEditId(null);
    setTipo("simples");
    setTexto("");
    setCid10("");
    setExibirCid(true);
  }

  /** Carrega um receituário no editor para edição. */
  function abrirEditar(r: Receituario) {
    setEditId(r.id);
    setTipo(r.tipo);
    setTexto(r.texto);
    setCid10(r.cid10 ?? "");
    setExibirCid(r.exibirCid);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  /** Confirma o cancelamento (não destrutivo) do receituário selecionado. */
  function confirmarCancelamento(motivo: string) {
    const alvo = cancelRec;
    if (!alvo) return;
    startTransition(async () => {
      const res = await cancelarDocumento({
        tabela: "certificates",
        id: alvo.id,
        motivo,
      });
      if (res?.ok) {
        toast.success("Receituário cancelado.");
        setCancelRec(null);
        if (editId === alvo.id) limparEditor();
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível cancelar o receituário.");
      }
    });
  }

  /** Imprime o texto atual do editor SEM exigir salvar (efêmero). */
  function imprimirAtual() {
    const conteudo = texto.trim();
    if (!conteudo) {
      toast.error("Escreva a prescrição antes de imprimir.");
      return;
    }
    imprimir(tipo, conteudo, exibirCid ? cid10.trim() : "");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5">
        {/* Segmented control Simples | Especial */}
        <div
          role="tablist"
          aria-label="Tipo de receituário"
          className="mb-4 inline-flex rounded-lg border border-line bg-muted-surface p-1"
        >
          {(["simples", "especial"] as Tipo[]).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tipo === t}
              onClick={() => setTipo(t)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-100",
                tipo === t
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-muted hover:text-ink",
              )}
            >
              {t === "simples" ? "Simples" : "Especial"}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Prescrição</span>
          <textarea
            rows={12}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={PLACEHOLDER[tipo]}
            className="w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <p className="mt-2 text-xs text-muted">
          {tipo === "especial"
            ? "Modelo de controle especial (Portaria 344/98) — impresso em duas vias (farmácia e paciente)."
            : "Receituário simples — prescrição de texto livre."}
        </p>

        {/* Datalist compartilhado do catálogo de CID (sugestão; a validação é
            no salvar e no servidor). */}
        <datalist id="cid-codes-receituario">
          {cidCodes.map((c) => (
            <option key={c.id} value={c.code}>
              {c.code} — {c.description}
            </option>
          ))}
        </datalist>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              CID-10 (opcional)
            </span>
            <input
              id="receituario-cid"
              list="cid-codes-receituario"
              value={cid10}
              onChange={(e) => setCid10(e.target.value)}
              placeholder="Ex.: M54.5"
              className="h-10 w-56 rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label className="flex h-10 items-center gap-2">
            <input
              type="checkbox"
              checked={exibirCid}
              onChange={(e) => setExibirCid(e.target.checked)}
              className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-100"
            />
            <span className="text-sm text-ink">Exibir CID na impressão</span>
          </label>
        </div>
        <p className="mt-1 text-xs text-muted">
          O CID-10 é opcional (LGPD) e deve pertencer ao catálogo do admin.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {editId && (
            <span className="mr-auto text-xs font-medium text-brand-600">
              Editando receituário
            </span>
          )}
          {editId && (
            <Button variant="ghost" onClick={limparEditor} disabled={pending}>
              <X className="h-4 w-4" /> Cancelar edição
            </Button>
          )}
          <Button variant="outline" onClick={imprimirAtual}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Button onClick={salvar} disabled={pending}>
            <Save className="h-4 w-4" />{" "}
            {pending
              ? "Salvando…"
              : editId
                ? "Salvar alterações"
                : "Salvar"}
          </Button>
        </div>
      </Card>

      {receituarios.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-5 py-16 text-center">
          <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted-surface text-muted">
            <ScrollText className="h-7 w-7" />
          </span>
          <p className="font-medium text-ink">Nenhum receituário emitido</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            Os receituários emitidos para este paciente aparecerão aqui.
          </p>
        </Card>
      ) : (
        <Stagger className="flex flex-col gap-3">
          {receituarios.map((r) => (
            <FadeInUp key={r.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge status={r.tipo === "especial" ? "active" : "ok"}>
                        {r.tipo === "especial" ? "Controle Especial" : "Simples"}
                      </Badge>
                      <span className="text-xs text-muted">{r.dataHora}</span>
                    </div>
                    <div
                      className={cn(
                        !!r.cancelledAt &&
                          "text-status-danger [&_*]:text-status-danger",
                      )}
                    >
                    <p className="whitespace-pre-line break-words text-sm text-ink">
                      {r.texto}
                    </p>
                    {r.cid10 && (
                      <p className="mt-1 text-xs text-muted">CID-10: {r.cid10}</p>
                    )}
                    <p className="mt-1 text-xs text-muted">{r.profissional}</p>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <DocumentActions
                      cancelled={!!r.cancelledAt}
                      cancelReason={r.cancelReason}
                      pending={pending}
                      onView={() => setViewRec(r)}
                      onEdit={() => abrirEditar(r)}
                      onPrint={() =>
                        imprimir(
                          r.tipo,
                          r.texto,
                          r.exibirCid ? r.cid10 ?? "" : "",
                        )
                      }
                      onCancel={() => setCancelRec(r)}
                    />
                  </div>
                </div>
              </Card>
            </FadeInUp>
          ))}
        </Stagger>
      )}

      {/* Modal Visualizar (read-only) */}
      <Modal
        open={!!viewRec}
        onClose={() => setViewRec(null)}
        title={
          viewRec?.tipo === "especial"
            ? "Receituário de Controle Especial"
            : "Receituário Simples"
        }
        subtitle="Visualização do documento (somente leitura)."
        footer={
          <Button variant="outline" onClick={() => setViewRec(null)}>
            Fechar
          </Button>
        }
      >
        {viewRec && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted">Emitido em</p>
                <p className="text-ink">{viewRec.dataHora}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted">Profissional</p>
                <p className="text-ink">{viewRec.profissional}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">Prescrição</p>
              <p className="whitespace-pre-line break-words text-ink">
                {viewRec.texto}
              </p>
            </div>
            {viewRec.exibirCid && viewRec.cid10 && (
              <div>
                <p className="text-xs font-medium text-muted">CID-10</p>
                <p className="text-ink">{viewRec.cid10}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal Cancelar (não destrutivo) */}
      <CancelarDocumentoModal
        open={!!cancelRec}
        onClose={() => setCancelRec(null)}
        onConfirm={confirmarCancelamento}
        pending={pending}
      />
    </div>
  );
}
