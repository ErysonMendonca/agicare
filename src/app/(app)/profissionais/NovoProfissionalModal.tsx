"use client";

import { useState, useActionState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, SquarePen } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TelefoneInput } from "@/components/ui/TelefoneInput";
import { CepInput } from "@/components/ui/MaskedInput";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import {
  createProfessional,
  updateProfessional,
  type ActionState,
} from "@/lib/actions/professionals";
import type { ProfissionalEdit } from "@/lib/data/professionals";

/** Valores padrão dos campos do formulário (vazios = novo cadastro). */
type FormDefaults = Partial<ProfissionalEdit>;

const PAPEIS_FORM = ["medico", "recepcao"] as const;

/** Normaliza o papel para os valores aceitos pelo Select (default medico). */
function papelDefault(role?: string): string {
  return role && (PAPEIS_FORM as readonly string[]).includes(role) ? role : "medico";
}

/**
 * Campos compartilhados entre criar e editar. `mostrarEmail` só na criação
 * (o e-mail vive em auth.users e não é editável por aqui). `mostrarStatus`
 * só na edição (toggle ativo/inativo).
 */
function CamposProfissional({
  prefixo,
  defaults,
  mostrarEmail,
  mostrarStatus,
}: {
  prefixo: string;
  defaults: FormDefaults;
  mostrarEmail: boolean;
  mostrarStatus: boolean;
}) {
  // Telefone controlado para aplicar máscara enquanto digita.
  const [telefone, setTelefone] = useState(defaults.phone ?? "");
  return (
    <div className="space-y-4">
      <Input
        id={`${prefixo}-nome`}
        name="full_name"
        label="Nome completo"
        placeholder="Ex.: Dr. João Pedro Oliveira"
        defaultValue={defaults.full_name ?? ""}
        required
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          id={`${prefixo}-especialidade`}
          name="specialty"
          label="Especialidade"
          placeholder="Ex.: Cardiologia"
          defaultValue={defaults.specialty ?? ""}
        />
        <Input
          id={`${prefixo}-conselho`}
          name="council_reg"
          label="Conselho"
          placeholder="Ex.: CRM/SP 123456"
          defaultValue={defaults.council_reg ?? ""}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          id={`${prefixo}-cargo`}
          name="role"
          label="Cargo"
          defaultValue={papelDefault(defaults.role)}
        >
          <option value="medico">Médico</option>
          <option value="recepcao">Recepção</option>
        </Select>
        <TelefoneInput
          id={`${prefixo}-telefone`}
          name="phone"
          label="Telefone"
          placeholder="(11) 90000-0000"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
        />
      </div>

      {mostrarEmail && (
        <Input
          id={`${prefixo}-email`}
          name="email"
          type="email"
          label="E-mail (login de acesso)"
          placeholder="email@clinica.com"
          required
        />
      )}

      {mostrarStatus && (
        <Select
          id={`${prefixo}-status`}
          name="active"
          label="Status"
          defaultValue={defaults.active === false ? "false" : "true"}
        >
          <option value="true">Ativo</option>
          <option value="false">Inativo</option>
        </Select>
      )}

      <div className="border-t border-line pt-4">
        <p className="mb-3 text-sm font-medium text-ink">Endereço</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <CepInput
            id={`${prefixo}-cep`}
            name="cep"
            label="CEP"
            placeholder="00000-000"
            defaultValue={defaults.cep ?? ""}
          />
          <div className="sm:col-span-2">
            <Input
              id={`${prefixo}-logradouro`}
              name="address"
              label="Logradouro"
              placeholder="Rua, avenida..."
              defaultValue={defaults.address ?? ""}
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            id={`${prefixo}-numero`}
            name="address_number"
            label="Número"
            placeholder="123"
            defaultValue={defaults.address_number ?? ""}
          />
          <div className="sm:col-span-2">
            <Input
              id={`${prefixo}-complemento`}
              name="complement"
              label="Complemento"
              placeholder="Sala, bloco..."
              defaultValue={defaults.complement ?? ""}
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            id={`${prefixo}-bairro`}
            name="neighborhood"
            label="Bairro"
            placeholder="Centro"
            defaultValue={defaults.neighborhood ?? ""}
          />
          <Input
            id={`${prefixo}-cidade`}
            name="city"
            label="Cidade"
            placeholder="São Paulo"
            defaultValue={defaults.city ?? ""}
          />
          <Input
            id={`${prefixo}-uf`}
            name="state"
            label="UF"
            placeholder="SP"
            maxLength={2}
            defaultValue={defaults.state ?? ""}
          />
        </div>
      </div>

      <div className="border-t border-line pt-4">
        <label htmlFor={`${prefixo}-obs`} className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Observações
          </span>
          <textarea
            id={`${prefixo}-obs`}
            name="notes"
            rows={3}
            placeholder="Anotações internas sobre o profissional (opcional)"
            defaultValue={defaults.notes ?? ""}
            className="w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </div>
    </div>
  );
}

/**
 * Botão "Novo Cadastro" + modal de criação.
 * Persiste via Server Action (createProfessional). No modo demo, simula sucesso.
 */
export function NovoProfissionalModal({
  triggerLabel = "Novo Cadastro",
  variant,
  size = "md",
  triggerIcon = <Plus className="h-4 w-4" />,
}: {
  triggerLabel?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  triggerIcon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createProfessional,
    undefined,
  );
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success("Profissional cadastrado com sucesso!");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {triggerIcon} {triggerLabel}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo Profissional"
        subtitle="Preencha os dados do profissional"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-novo-profissional" disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <form id="form-novo-profissional" action={formAction}>
          <CamposProfissional
            prefixo="np"
            defaults={{ active: true }}
            mostrarEmail
            mostrarStatus
          />
          {state?.error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {state.error}
            </p>
          )}
        </form>
      </Modal>
    </>
  );
}

/**
 * Botão "Editar" por linha + modal pré-preenchido.
 * `id` é fixado na action via bind; o e-mail não é editável aqui.
 */
export function EditarProfissionalModal({
  id,
  edit,
}: {
  id: string;
  edit: ProfissionalEdit;
}) {
  const [open, setOpen] = useState(false);
  const updateWithId = updateProfessional.bind(null, id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateWithId,
    undefined,
  );
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success("Profissional atualizado com sucesso!");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  const formId = `form-editar-profissional-${id}`;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <SquarePen className="h-3.5 w-3.5" /> Editar
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Editar Profissional"
        subtitle="Atualize os dados do profissional"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form={formId} disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <form id={formId} action={formAction}>
          <CamposProfissional
            prefixo={`ep-${id}`}
            defaults={edit}
            mostrarEmail={false}
            mostrarStatus
          />
          {state?.error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {state.error}
            </p>
          )}
        </form>
      </Modal>
    </>
  );
}
