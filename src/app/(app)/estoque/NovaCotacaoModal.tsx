"use client";

import { useState, useRef, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { criarCotacao, MAX_COTACAO_BYTES } from "@/lib/actions/stock";

/**
 * Adiciona uma cotação a uma solicitação de compra, com anexo opcional de PDF
 * (≤5MB) enviado ao bucket privado 'cotacoes'. O upload é feito no servidor
 * (a Server Action recebe o File via FormData).
 */
export function NovaCotacaoModal({
  requestId,
  requestLabel,
}: {
  requestId: string;
  requestLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(criarCotacao, undefined);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success("Cotação registrada!");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  /** Validação de UX (o servidor revalida tipo/tamanho). */
  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    if (!isPdf) {
      setFileError("O anexo deve ser um PDF.");
      e.target.value = "";
    } else if (f.size > MAX_COTACAO_BYTES) {
      setFileError("O anexo excede o limite de 5MB.");
      e.target.value = "";
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Cotação
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nova Cotação"
        subtitle={`Solicitação ${requestLabel}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-cotacao"
              disabled={pending || !!fileError}
            >
              {pending ? "Enviando..." : "Registrar Cotação"}
            </Button>
          </>
        }
      >
        <form id="form-cotacao" action={formAction} className="space-y-4">
          <input type="hidden" name="purchase_request_id" value={requestId} />
          <Input
            id="cot-fornecedor"
            name="supplier_name"
            label="Fornecedor"
            placeholder="Ex.: Descarpack Descartáveis"
            required
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="cot-valor"
              name="amount"
              label="Valor (R$)"
              placeholder="Ex.: 720,00"
              inputMode="decimal"
            />
            <Input
              id="cot-prazo"
              name="lead_time"
              label="Prazo de entrega"
              placeholder="Ex.: 5 dias úteis"
            />
          </div>

          <label htmlFor="cot-anexo" className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
              <Paperclip className="h-4 w-4 text-muted" /> Anexo (PDF, até 5MB)
            </span>
            <input
              id="cot-anexo"
              ref={fileRef}
              type="file"
              name="attachment"
              accept="application/pdf,.pdf"
              onChange={onPickFile}
              className="block w-full text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
          </label>
          {fileError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {fileError}
            </p>
          )}

          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {state.error}
            </p>
          )}
        </form>
      </Modal>
    </>
  );
}
