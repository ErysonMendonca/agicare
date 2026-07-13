"use client";

import { useState, useTransition } from "react";
import { FileText, Printer, ScrollText, Check } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { FilaItem } from "@/lib/data/queue";
import type { ConsentTemplate } from "@/lib/data/consent-templates";
import type { ClinicaImpressao } from "@/app/(app)/prontuario/[patientId]/documentos/AtestadoImpressao";
import type { DadosAtendimentoDoc } from "../../FichaAtendimento";
import {
  imprimirDocumentosAtendimento,
  type PacienteFicha,
  type TermoImpressao,
} from "../../ImpressaoDocumentosAtendimento";
import { registrarConsentimentosImpressos } from "@/lib/actions/consents";

// ════════════════════════════════════════════════════════════════
// Modal disparado ao salvar a Ficha de Atendimento (recepção): lista a
// Ficha de Detalhe do Atendimento + cada termo ATIVO para IMPRESSÃO (o
// paciente assina no papel). "Concluir" registra os termos impressos
// (best-effort) e fecha. Também é a "nova visualização" da Reimpressão.
// ════════════════════════════════════════════════════════════════

/** Formata birth_date (ISO "YYYY-MM-DD") como dd/MM/aaaa sem bug de fuso. */
function fmtNascimento(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

/** Filtra ids reais (persistidos) dos ids de fallback demo (ex.: "demo-consent-0"). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function DocumentosAtendimentoModal({
  aberto,
  onClose,
  item,
  dados,
  clinica,
  termosAtivos,
  patientId,
  professionalId,
}: {
  aberto: boolean;
  onClose: () => void;
  item: FilaItem;
  dados: DadosAtendimentoDoc;
  clinica: ClinicaImpressao;
  termosAtivos: ConsentTemplate[];
  patientId: string | null;
  professionalId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [impresso, setImpresso] = useState(false);
  // Garante um único registro em consents por abertura do modal (imprimir +
  // concluir não devem duplicar as linhas de emissão).
  const [registrado, setRegistrado] = useState(false);

  // Paciente + carimbos do atendimento para a identificação da ficha.
  const paciente: PacienteFicha = {
    nome: item.paciente,
    nascimento: fmtNascimento(item.pacienteNascimento),
    idade: item.pacienteIdade ?? "",
    sexo: item.pacienteSexo ?? "",
    nomeMae: item.pacienteNomeMae ?? "",
    prontuario: item.pacienteRegistro ?? "",
    atendimento: item.atendimentoCodigo ?? "",
    senha: item.codigo && item.codigo !== "—" ? item.codigo : "",
    convenio: dados.convenio,
  };

  const termosOrdenados = [...termosAtivos].sort((a, b) => a.sortOrder - b.sortOrder);

  const documentos = [
    { id: "ficha", titulo: "Ficha de Detalhe do Atendimento", tipo: "ficha" as const },
    ...termosOrdenados.map((t) => ({ id: t.id, titulo: t.title, tipo: "termo" as const })),
  ];

  /** Registra os termos impressos no servidor (best-effort, não bloqueia). */
  function registrar(templates: ConsentTemplate[] = termosOrdenados) {
    if (registrado || !patientId || templates.length === 0) return;
    // Ignora ids de fallback demo (não-UUID): não há registro a persistir e o
    // servidor rejeitaria por Zod, gerando um toast de erro desnecessário.
    const templateIds = templates
      .map((t) => t.id)
      .filter((id) => UUID_RE.test(id));
    if (templateIds.length === 0) return;
    setRegistrado(true);
    startTransition(async () => {
      const res = await registrarConsentimentosImpressos({
        // FilaItem não expõe o id do profissional (só o nome) → null por ora;
        // consents.professional_id é nullable, então não bloqueia o registro.
        patientId,
        professionalId: professionalId ?? null,
        templateIds,
      });
      if (res?.error) toast.error(res.error);
    });
  }

  function imprimirTudo() {
    const termos: TermoImpressao[] = termosOrdenados.map((t) => ({
      title: t.title,
      body: t.body,
    }));
    imprimirDocumentosAtendimento(clinica, paciente, dados, termos);
    setImpresso(true);
    registrar();
  }

  function imprimirSomenteFicha() {
    imprimirDocumentosAtendimento(clinica, paciente, dados, []);
    setImpresso(true);
  }

  /** Impressão seletiva de uma única linha da lista (ficha OU um termo). */
  function imprimirDocumento(doc: (typeof documentos)[number]) {
    if (doc.tipo === "ficha") {
      imprimirSomenteFicha();
      return;
    }
    const termo = termosOrdenados.find((t) => t.id === doc.id);
    if (!termo) return;
    imprimirDocumentosAtendimento(
      clinica,
      paciente,
      dados,
      [{ title: termo.title, body: termo.body }],
      false,
    );
    setImpresso(true);
    registrar([termo]);
  }

  function concluir() {
    registrar();
    onClose();
  }

  return (
    <Modal
      open={aberto}
      onClose={onClose}
      title="Documentos do Atendimento"
      subtitle="Imprima a ficha e os termos para o paciente assinar no papel."
      className="max-w-xl"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Fechar
          </Button>
          <Button type="button" variant="primary" onClick={concluir} disabled={pending}>
            <Check className="h-4 w-4" />
            Concluir
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ul className="space-y-2">
          {documentos.map((doc, i) => (
            <motion.li
              key={doc.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.04 }}
              className="flex items-center gap-3 rounded-xl border border-line bg-white p-3"
            >
              <span
                className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg ${
                  doc.tipo === "ficha"
                    ? "bg-brand-50 text-brand-600"
                    : "bg-purple-50 text-purple-600"
                }`}
              >
                {doc.tipo === "ficha" ? (
                  <FileText className="h-4 w-4" />
                ) : (
                  <ScrollText className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{doc.titulo}</p>
                <p className="text-xs text-muted">
                  {doc.tipo === "ficha"
                    ? "Dados administrativos do atendimento"
                    : "Termo de consentimento — assinatura no papel"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => imprimirDocumento(doc)}
                disabled={pending}
                title={`Imprimir ${doc.titulo}`}
                aria-label={`Imprimir ${doc.titulo}`}
                className="flex-none rounded-lg border border-line p-2 text-muted transition-colors hover:bg-muted-surface hover:text-brand-600 disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
              </button>
            </motion.li>
          ))}
        </ul>

        {termosOrdenados.length === 0 && (
          <p className="rounded-lg border border-line bg-muted-surface/60 px-3 py-2 text-xs text-muted">
            Nenhum termo de consentimento ativo. Cadastre termos em
            Configurações → Consentimentos.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="primary"
            onClick={imprimirTudo}
            disabled={pending}
          >
            <Printer className="h-4 w-4" />
            Imprimir todos
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={imprimirSomenteFicha}
            disabled={pending}
          >
            <FileText className="h-4 w-4" />
            Só a ficha
          </Button>
          {impresso && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-status-ok">
              <Check className="h-3.5 w-3.5" /> Enviado à impressão
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}
