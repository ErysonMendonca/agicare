"use client";

import { useState, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { createPatient } from "@/lib/actions/patients";

/**
 * Botão "Novo Paciente" + modal de cadastro.
 * Persiste via Server Action (createPatient) com validação Zod; no modo demo, simula sucesso.
 */
export function NovoPacienteModal() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createPatient, undefined);
  const router = useRouter();

  // Fecha o modal e notifica ao salvar; mostra erro via toast.
  useEffect(() => {
    if (state?.ok) {
      toast.success("Paciente cadastrado com sucesso!");
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
        <UserPlus className="h-4 w-4" />
        Novo Paciente
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo Paciente"
        subtitle="Preencha os dados do paciente"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-novo-paciente" disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <form id="form-novo-paciente" action={formAction} className="space-y-4">
          <Input id="np-nome" name="full_name" label="Nome completo" placeholder="Ex.: João Pedro Oliveira" required />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input id="np-cpf" name="cpf" label="CPF" placeholder="000.000.000-00" />
            <Input id="np-nascimento" name="birth_date" label="Data de nascimento" type="date" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input id="np-telefone" name="phone" label="Telefone" placeholder="(11) 90000-0000" />
            <Input id="np-email" name="email" label="E-mail" type="email" placeholder="email@exemplo.com" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input id="np-convenio" name="convenio" label="Convênio" placeholder="Unimed, Particular..." />
            <Select id="np-tipo" name="blood_type" label="Tipo sanguíneo" defaultValue="">
              <option value="" disabled>
                Selecione
              </option>
              {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </div>
          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
          )}
        </form>
      </Modal>
    </>
  );
}
