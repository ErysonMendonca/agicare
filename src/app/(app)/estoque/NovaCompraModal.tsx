"use client";

import { useState, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { criarSolicitacaoCompra } from "@/lib/actions/stock";

/** Botão "Nova Solicitação" de compra + modal com justificativa. */
export function NovaCompraModal() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    criarSolicitacaoCompra,
    undefined,
  );
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success("Solicitação de compra criada!");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <ShoppingCart className="h-4 w-4" />
        Nova Solicitação
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Solicitação de Compra"
        subtitle="Justifique a necessidade da compra"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-compra" disabled={pending}>
              {pending ? "Enviando..." : "Solicitar"}
            </Button>
          </>
        }
      >
        <form id="form-compra" action={formAction} className="space-y-4">
          <Input
            id="co-produto"
            name="product_name"
            label="Produto"
            placeholder="Ex.: Luva Cirúrgica nº 7,5"
            required
          />
          <Input
            id="co-qtd"
            name="quantity"
            label="Quantidade"
            placeholder="Ex.: 40 caixas"
            required
          />
          <label htmlFor="co-just" className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Justificativa
            </span>
            <textarea
              id="co-just"
              name="justification"
              rows={4}
              placeholder="Explique o motivo da solicitação..."
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              required
            />
          </label>

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
