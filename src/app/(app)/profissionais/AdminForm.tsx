"use client";

import { useState, useActionState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TelefoneInput } from "@/components/ui/TelefoneInput";
import { formatCpf } from "@/lib/documentos";
import { Select } from "@/components/ui/Select";
import { Card, CardBody, CardFooter } from "@/components/ui/Card";
import {
  createAdminProfessional,
  updateProfessional,
  type ActionState,
} from "@/lib/actions/professionals";
import type { ProfissionalEdit } from "@/lib/data/professionals";
import type { AttendanceOption } from "@/lib/data/attendance-options.shared";
import type { Cargo } from "@/lib/data/usuarios.shared";

/** Valores padrão dos campos do formulário (vazios = novo cadastro). */
type FormDefaults = Partial<ProfissionalEdit>;

// Cargos/Papéis disponíveis para equipe administrativa (conforme Perfis de Acesso)
const PAPEIS_ADMIN = [
  { value: "admin", label: "Administrador" },
  { value: "medico", label: "Médico" },
  { value: "recepcao", label: "Recepção" },
];

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-line p-5">
      <legend className="px-2 text-sm font-semibold text-brand-600">
        {titulo}
      </legend>
      <div className="space-y-5">{children}</div>
    </fieldset>
  );
}

function CamposAdmin({
  defaults,
  mostrarStatus,
  departamentos,
  isEdit,
  cargos,
}: {
  defaults: FormDefaults;
  mostrarStatus: boolean;
  departamentos: AttendanceOption[];
  isEdit: boolean;
  cargos: Cargo[];
}) {
  const [telefone, setTelefone] = useState(defaults.phone ?? "");
  const [documento, setDocumento] = useState(defaults.document ?? "");

  function handleCpfCnpj(v: string) {
    const limpo = v.replace(/\D/g, "");
    setDocumento(formatCpf(limpo));
  }

  // Combina papéis base e cargos personalizados
  const perfisOpcoes = [
    ...PAPEIS_ADMIN.map((p) => ({ value: `${p.value}:`, label: p.label })),
    ...cargos.map((c) => ({ value: `${c.baseRole}:${c.id}`, label: c.nome })),
  ];

  // Identifica o valor selecionado por padrão
  const defaultRoleValue = defaults.cargoId
    ? `${defaults.role}:${defaults.cargoId}`
    : `${defaults.role ?? "recepcao"}:`;

  return (
    <div className="space-y-8">
      {/* ── 1. Dados Pessoais & Contato ───────────────────────── */}
      <Secao titulo="Dados Principais">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Input
              id="full_name"
              name="full_name"
              label="Nome Completo"
              defaultValue={defaults.full_name}
              placeholder="Ex.: Maria da Silva"
              required
              autoFocus
            />
          </div>

          <div className="lg:col-span-1">
            <Input
              id="document"
              name="document"
              label="CPF"
              value={documento}
              onChange={(e) => handleCpfCnpj(e.target.value)}
              placeholder="000.000.000-00"
              required
            />
            <input type="hidden" name="person_type" value="cpf" />
          </div>

          <div className="lg:col-span-1">
            <TelefoneInput
              id="phone"
              name="phone"
              label="Telefone"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              required
            />
          </div>

          <div className="lg:col-span-2">
            <Input
              id="email"
              name="email"
              type="email"
              label="E-mail de Contato"
              defaultValue={defaults.email}
              placeholder="Ex.: maria@clinica.com.br"
              required
            />
          </div>
        </div>
      </Secao>

      {/* ── 2. Dados Profissionais ───────────────────────── */}
      <Secao titulo="Departamento e Cargo">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Input
            id="department"
            name="department"
            type="text"
            label="Departamento"
            placeholder="Ex.: Financeiro"
            defaultValue={defaults.department ?? ""}
            required
          />
          <Input
            id="job_title"
            name="job_title"
            type="text"
            label="Cargo"
            placeholder="Ex.: Gerente Financeiro"
            defaultValue={defaults.job_title ?? ""}
            required
          />
        </div>
      </Secao>

      {/* ── 3. Dados de Acesso (Login/Senha) ───────────────────────── */}
      {!isEdit && (
        <Secao titulo="Credenciais de Acesso">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Input
              id="username"
              name="username"
              type="text"
              label="Login (Usuário)"
              placeholder="joao.silva"
              required
            />
            <Select
              id="role"
              name="role"
              label="Perfil de acesso (Dentro do sistema)"
              defaultValue={defaultRoleValue}
              required
            >
              {perfisOpcoes.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 mt-5">
            <Input
              id="password"
              name="password"
              type="password"
              label="Senha"
              placeholder="Mínimo de 6 caracteres"
              required
            />
            <Input
              id="confirm_password"
              name="confirm_password"
              type="password"
              label="Confirmar Senha"
              placeholder="••••••••"
              required
            />
          </div>
        </Secao>
      )}
      
      {isEdit && (
        <Secao titulo="Perfil de Acesso">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Select
              id="role"
              name="role"
              label="Perfil de acesso (Dentro do sistema)"
              defaultValue={defaultRoleValue}
              required
            >
              {perfisOpcoes.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
        </Secao>
      )}

      {/* ── 4. Status ───────────────────────────────────────────── */}
      {mostrarStatus && (
        <Secao titulo="Status">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="active"
              name="active"
              value="true"
              defaultChecked={defaults.active !== false}
              className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-600"
            />
            <div>
              <label htmlFor="active" className="text-sm font-medium text-ink">
                Conta Ativa
              </label>
              <p className="text-xs text-muted">
                Contas inativas não podem fazer login no sistema.
              </p>
            </div>
          </div>
        </Secao>
      )}
    </div>
  );
}

export function AdminForm({
  profissional,
  departamentos,
  cargos,
}: {
  profissional?: ProfissionalEdit;
  departamentos: AttendanceOption[];
  cargos: Cargo[];
}) {
  const router = useRouter();
  const isEdit = !!profissional;

  // A action de criação é a nossa nova 'createAdminProfessional' que aceita login e senha.
  // A action de atualização continua usando a 'updateProfessional' existente
  const actionToUse = isEdit
    ? updateProfessional.bind(null, profissional.id)
    : createAdminProfessional;

  const [state, formAction, pending] = useActionState(actionToUse, undefined);

  useEffect(() => {
    if (state?.ok) {
      toast.success(
        isEdit
          ? "Cadastro administrativo atualizado."
          : "Equipe administrativa cadastrada com sucesso!"
      );
      router.push("/profissionais");
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, isEdit, router]);

  return (
    <Card className="w-full">
      <form action={formAction}>
        <CardBody className="p-6 sm:p-8">
          <CamposAdmin
            defaults={profissional ?? {}}
            mostrarStatus={isEdit}
            departamentos={departamentos}
            isEdit={isEdit}
            cargos={cargos}
          />
        </CardBody>

        <CardFooter className="flex flex-col-reverse justify-end gap-3 border-t border-line bg-muted-surface p-6 sm:flex-row sm:px-8">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
            disabled={pending}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={pending}
            className="w-full sm:w-auto"
          >
            {pending ? "Salvando..." : "Salvar Cadastro"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
