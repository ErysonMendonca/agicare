"use client";

import { useState } from "react";
import {
  FileText,
  ChevronDown,
  ChevronUp,
  Download,
  Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { getProntuarioManualUrl } from "@/lib/actions/pacientes";

/**
 * Prontuário manual do cadastro: o TEXTO digitado (toggle local) e, quando há,
 * o ARQUIVO digitalizado anexado. O arquivo é "puxado" via URL assinada gerada
 * no servidor (Storage privado) — sem expor o path bruto ao client.
 */
export function ProntuarioManual({
  conteudo,
  patientId,
  temArquivo,
  nomeArquivo,
}: {
  conteudo: string | null;
  patientId: string;
  temArquivo: boolean;
  nomeArquivo: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [baixando, setBaixando] = useState(false);

  async function puxarArquivo() {
    setBaixando(true);
    try {
      const res = await getProntuarioManualUrl(patientId);
      if (res.error || !res.url) {
        toast.error(res.error ?? "Não foi possível abrir o arquivo.");
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Falha ao abrir o arquivo anexado.");
    } finally {
      setBaixando(false);
    }
  }

  if (!conteudo && !temArquivo) {
    return (
      <p className="text-sm text-muted">
        Nenhum prontuário manual anexado ao cadastro deste paciente.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {conteudo && (
        <div>
          <Button variant="outline" size="sm" onClick={() => setAberto((v) => !v)}>
            <FileText className="h-4 w-4" />
            {aberto ? "Ocultar prontuário manual" : "Puxar prontuário manual"}
            {aberto ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          {aberto && (
            <div className="mt-3 whitespace-pre-wrap rounded-xl border border-line bg-muted-surface p-4 text-sm text-ink">
              {conteudo}
            </div>
          )}
        </div>
      )}

      {temArquivo && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={puxarArquivo}
            disabled={baixando}
          >
            <Download className="h-4 w-4" />
            {baixando ? "Abrindo…" : "Puxar arquivo anexado"}
          </Button>
          {nomeArquivo && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <Paperclip className="h-3.5 w-3.5" /> {nomeArquivo}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
