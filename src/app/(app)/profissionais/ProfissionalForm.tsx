"use client";

import { useState, useActionState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TelefoneInput } from "@/components/ui/TelefoneInput";
import { CepInput, CnsInput } from "@/components/ui/MaskedInput";
import { formatCpf, formatCnpj } from "@/lib/documentos";
import { Select } from "@/components/ui/Select";
import { Card, CardBody, CardFooter } from "@/components/ui/Card";
import {
  createProfessional,
  updateProfessional,
  type ActionState,
} from "@/lib/actions/professionals";
import type {
  ProfissionalEdit,
  CredencialEdit,
} from "@/lib/data/professionals";
import type { AttendanceOption } from "@/lib/data/attendance-options.shared";

/** Uma credencial de convênio vazia (nova linha do formulário). */
const credVazia = (): CredencialEdit => ({
  convenio: "",
  vigencia: "",
  convenio_code: "",
  lab_code: "",
  tiss_login: "",
  tiss_password: "",
  recebe_eletivo: false,
  recebe_urgencia: false,
  recebe_internacao: false,
  xml_tag: "",
  cpf_or_convenio_code: "",
});

const SEXOS = ["Masculino", "Feminino", "Intersexo", "Não informado"];
const RACAS = ["Branca", "Preta", "Parda", "Amarela", "Indígena", "Não informado"];

/** Valores padrão dos campos do formulário (vazios = novo cadastro). */
type FormDefaults = Partial<ProfissionalEdit>;

const PAPEIS_FORM = ["medico", "recepcao"] as const;

function papelDefault(role?: string): string {
  return role && (PAPEIS_FORM as readonly string[]).includes(role) ? role : "medico";
}

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

function CamposProfissional({
  prefixo,
  defaults,
  mostrarStatus,
  especialidades,
  tiposProfissional,
}: {
  prefixo: string;
  defaults: FormDefaults;
  mostrarStatus: boolean;
  especialidades: AttendanceOption[];
  tiposProfissional: AttendanceOption[];
}) {
  const [telefone, setTelefone] = useState(defaults.phone ?? "");
  const especialidadeAtual = defaults.specialty ?? "";
  const especialidadeLegada =
    especialidadeAtual !== "" &&
    !especialidades.some((e) => e.value === especialidadeAtual);
  const [personType, setPersonType] = useState(defaults.person_type || "cpf");
  const [documento, setDocumento] = useState(defaults.document ?? "");
  const [cep, setCep] = useState(defaults.cep ?? "");
  const [endereco, setEndereco] = useState(defaults.address ?? "");
  const [bairro, setBairro] = useState(defaults.neighborhood ?? "");
  const [cidade, setCidade] = useState(defaults.city ?? "");
  const [uf, setUf] = useState(defaults.state ?? "");
  const [buscandoCep, setBuscandoCep] = useState(false);

  async function buscarCep(valor: string) {
    const limpo = valor.replace(/\D/g, "");
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const data: {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      } = await res.json();
      if (data.erro) {
        toast.error("CEP não encontrado.");
        return;
      }
      setEndereco(data.logradouro ?? "");
      setBairro(data.bairro ?? "");
      setCidade(data.localidade ?? "");
      setUf(data.uf ?? "");
    } catch {
      toast.error("Não foi possível consultar o CEP.");
    } finally {
      setBuscandoCep(false);
    }
  }

  const [creds, setCreds] = useState<CredencialEdit[]>(
    defaults.credentials && defaults.credentials.length > 0
      ? defaults.credentials
      : [],
  );

  const mascararDoc = personType === "cnpj" ? formatCnpj : formatCpf;

  function setCred(i: number, patch: Partial<CredencialEdit>) {
    setCreds((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  return (
    <div className="space-y-6">
      {/* ── Dados pessoais ────────────────────────────────────────── */}
      <Secao titulo="Dados pessoais">
        <Input
          id={`${prefixo}-nome`}
          name="full_name"
          label="Nome completo"
          placeholder="Ex.: Dr. João Pedro Oliveira"
          defaultValue={defaults.full_name ?? ""}
          required
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Select
            id={`${prefixo}-person-type`}
            name="person_type"
            label="Tipo da pessoa"
            value={personType}
            onChange={(e) => {
              setPersonType(e.target.value);
              setDocumento("");
            }}
          >
            <option value="cpf">Pessoa Física (CPF)</option>
            <option value="cnpj">Pessoa Jurídica (CNPJ)</option>
          </Select>
          <div>
            <Input
              id={`${prefixo}-documento`}
              name="document"
              label={personType === "cnpj" ? "CNPJ" : "CPF"}
              inputMode="numeric"
              placeholder={
                personType === "cnpj" ? "00.000.000/0000-00" : "000.000.000-00"
              }
              value={documento}
              onChange={(e) => setDocumento(mascararDoc(e.target.value))}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Input
            id={`${prefixo}-social`}
            name="social_name"
            label="Nome social"
            placeholder="Como prefere ser chamado(a)"
            defaultValue={defaults.social_name ?? ""}
          />
          <Input
            id={`${prefixo}-nascimento`}
            name="birth_date"
            type="date"
            label="Data de nascimento"
            defaultValue={defaults.birth_date ?? ""}
          />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Select
            id={`${prefixo}-sexo`}
            name="sex"
            label="Sexo"
            defaultValue={defaults.sex ?? ""}
          >
            <option value="">Selecione</option>
            {SEXOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select
            id={`${prefixo}-raca`}
            name="race"
            label="Raça/Cor"
            defaultValue={defaults.race ?? ""}
          >
            <option value="">Selecione</option>
            {RACAS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>
      </Secao>

      {/* ── Tipo de profissional ──────────────────────────────────── */}
      <Secao titulo="Tipo de profissional">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-4 sm:grid-cols-2">
          <Select
            id={`${prefixo}-tipo-profissional`}
            name="professional_type"
            label="Tipo de profissional"
            defaultValue={defaults.professional_type ?? ""}
          >
            <option value="">Selecione...</option>
            {tiposProfissional
              .slice()
              .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
              .map((t) => (
                <option key={t.id} value={t.value}>
                  {t.label}
                </option>
              ))}
          </Select>
          <Select
            id={`${prefixo}-especialidade`}
            name="specialty"
            label="Especialidade"
            defaultValue={especialidadeAtual}
          >
            <option value="">Selecione...</option>
            {especialidades
              .slice()
              .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
              .map((e) => (
                <option key={e.id} value={e.value}>
                  {e.label}
                </option>
              ))}
            {especialidadeLegada && (
              <option value={especialidadeAtual}>{especialidadeAtual}</option>
            )}
          </Select>
          <CnsInput
            id={`${prefixo}-cns`}
            name="cns"
            label="CNS"
            placeholder="000 0000 0000 0000"
            defaultValue={defaults.cns ?? ""}
          />
          <Input
            id={`${prefixo}-cnes`}
            name="cnes"
            label="CNES"
            placeholder="Cód. do estabelecimento"
            defaultValue={defaults.cnes ?? ""}
          />
        </div>
      </Secao>

      {/* ── Conselho ──────────────────────────────────────────────── */}
      <Secao titulo="Conselho">
        <input
          type="hidden"
          name="council_reg"
          defaultValue={defaults.council_reg ?? ""}
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Input
            id={`${prefixo}-council-number`}
            name="council_number"
            label="Número de conselho"
            placeholder="123456"
            defaultValue={defaults.council_number ?? ""}
          />
          <Input
            id={`${prefixo}-council-name`}
            name="council_name"
            label="Conselho"
            placeholder="Ex.: CRM, CRO, COREN"
            defaultValue={defaults.council_name ?? ""}
          />
          <Input
            id={`${prefixo}-council-uf`}
            name="council_uf"
            label="UF do conselho"
            placeholder="SP"
            maxLength={2}
            defaultValue={defaults.council_uf ?? ""}
          />
          <Input
            id={`${prefixo}-council-expiry`}
            name="council_expiry"
            type="date"
            label="Validade do conselho"
            defaultValue={defaults.council_expiry ?? ""}
          />
        </div>
      </Secao>

      {/* ── Contato ───────────────────────────────────────────────── */}
      <Secao titulo="Contato">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TelefoneInput
            id={`${prefixo}-telefone`}
            name="phone"
            label="Número"
            placeholder="(11) 90000-0000"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
          />
          <Input
            id={`${prefixo}-email`}
            name="email"
            type="email"
            label="E-mail"
            placeholder="email@exemplo.com"
            autoComplete="email"
            defaultValue={defaults.email ?? ""}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Select
            id={`${prefixo}-cargo`}
            name="role"
            label="Cargo"
            defaultValue={papelDefault(defaults.role)}
          >
            <option value="medico">Médico</option>
            <option value="recepcao">Recepção</option>
          </Select>

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
        </div>

        <div className="pt-2">
          <p className="mb-4 text-sm font-medium text-ink">Endereço completo</p>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-4 sm:grid-cols-2">
            <CepInput
              id={`${prefixo}-cep`}
              name="cep"
              label={buscandoCep ? "CEP (buscando...)" : "CEP"}
              placeholder="00000-000"
              value={cep}
              onChange={(e) => {
                setCep(e.target.value);
                if (e.target.value.replace(/\D/g, "").length === 8) {
                  buscarCep(e.target.value);
                }
              }}
              onBlur={(e) => buscarCep(e.target.value)}
            />
            <div className="sm:col-span-2">
              <Input
                id={`${prefixo}-address`}
                name="address"
                label="Logradouro"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
              />
            </div>
            <Input
              id={`${prefixo}-numero`}
              name="address_number"
              label="Número"
              defaultValue={defaults.address_number ?? ""}
            />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Input
              id={`${prefixo}-complemento`}
              name="address_complement"
              label="Complemento"
              defaultValue={defaults.complement ?? ""}
            />
            <Input
              id={`${prefixo}-bairro`}
              name="neighborhood"
              label="Bairro"
              value={bairro}
              onChange={(e) => setBairro(e.target.value)}
            />
            <Input
              id={`${prefixo}-cidade`}
              name="city"
              label="Cidade"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
            />
          </div>
          <div className="mt-5 sm:w-1/3">
            <Input
              id={`${prefixo}-uf`}
              name="state"
              label="UF"
              maxLength={2}
              value={uf}
              onChange={(e) => setUf(e.target.value)}
            />
          </div>
        </div>
      </Secao>

      {/* ── Acesso ───────────────────────────────────────────────── */}
      {!mostrarStatus && (
        <Secao titulo="Acesso">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input
              id={`${prefixo}-login`}
              name="username"
              type="text"
              label="Login (Usuário)"
              placeholder="joao.silva"
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 mt-5">
            <Input
              id={`${prefixo}-senha`}
              name="password"
              type="password"
              label="Senha"
              placeholder="••••••••"
              autoComplete="new-password"
            />
            <Input
              id={`${prefixo}-senha-confirma`}
              name="confirm_password"
              type="password"
              label="Confirmar Senha"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
        </Secao>
      )}

      {/* ── Credenciais de Convênio ─────────────────────────────── */}
      <Secao titulo="Credenciais de Convênio">
        {/* Passa as credenciais serializadas para o Action no lado do server */}
        <input type="hidden" name="credentials" value={JSON.stringify(creds)} />

        <div className="space-y-4">
          {creds.map((cred, i) => (
            <div
              key={i}
              className="relative flex flex-col gap-4 rounded-lg bg-black/5 p-4 sm:flex-row sm:items-start"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-2 h-8 w-8 !p-0 text-muted hover:text-red-600 sm:static sm:mt-6"
                onClick={() => setCreds((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Input
                  label="Convênio"
                  value={cred.convenio}
                  onChange={(e) => setCred(i, { convenio: e.target.value })}
                />
                <Input
                  label="Vigência"
                  value={cred.vigencia}
                  onChange={(e) => setCred(i, { vigencia: e.target.value })}
                />
                <Input
                  label="Cód. Convênio"
                  value={cred.convenio_code}
                  onChange={(e) => setCred(i, { convenio_code: e.target.value })}
                />
                <Input
                  label="Cód. Laboratório"
                  value={cred.lab_code}
                  onChange={(e) => setCred(i, { lab_code: e.target.value })}
                />
                <Input
                  label="Login TISS"
                  value={cred.tiss_login}
                  onChange={(e) => setCred(i, { tiss_login: e.target.value })}
                />
                <Input
                  label="Senha TISS"
                  value={cred.tiss_password}
                  onChange={(e) => setCred(i, { tiss_password: e.target.value })}
                />
                <Input
                  label="Tag XML"
                  value={cred.xml_tag}
                  onChange={(e) => setCred(i, { xml_tag: e.target.value })}
                />
                <Input
                  label="CPF/Cód. Convênio"
                  value={cred.cpf_or_convenio_code}
                  onChange={(e) =>
                    setCred(i, { cpf_or_convenio_code: e.target.value })
                  }
                />
                <div className="col-span-full mt-2 flex flex-wrap gap-4 text-sm text-ink">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="rounded border-line text-brand-600 focus:ring-brand-500"
                      checked={cred.recebe_eletivo}
                      onChange={(e) =>
                        setCred(i, { recebe_eletivo: e.target.checked })
                      }
                    />
                    Recebe Eletivo
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="rounded border-line text-brand-600 focus:ring-brand-500"
                      checked={cred.recebe_urgencia}
                      onChange={(e) =>
                        setCred(i, { recebe_urgencia: e.target.checked })
                      }
                    />
                    Recebe Urgência
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="rounded border-line text-brand-600 focus:ring-brand-500"
                      checked={cred.recebe_internacao}
                      onChange={(e) =>
                        setCred(i, { recebe_internacao: e.target.checked })
                      }
                    />
                    Recebe Internação
                  </label>
                </div>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCreds((prev) => [...prev, credVazia()])}
          >
            <Plus className="h-4 w-4" /> Adicionar Credencial
          </Button>
        </div>
      </Secao>
    </div>
  );
}

export function ProfissionalForm({
  profissional,
  especialidades,
  tiposProfissional,
}: {
  profissional?: ProfissionalEdit;
  especialidades: AttendanceOption[];
  tiposProfissional: AttendanceOption[];
}) {
  const router = useRouter();
  
  const action = profissional
    ? updateProfessional.bind(null, profissional.id)
    : createProfessional;

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action as any,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success(
        profissional
          ? "Profissional atualizado com sucesso!"
          : "Profissional criado com sucesso!"
      );
      router.push("/profissionais");
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router, profissional]);

  return (
    <Card className="w-full">
      <form action={formAction}>
        <CardBody className="p-8">
          <CamposProfissional
            prefixo={profissional ? `ep-${profissional.id}` : "np"}
            defaults={profissional ?? {}}
            mostrarStatus={!!profissional}
            especialidades={especialidades}
            tiposProfissional={tiposProfissional}
          />
          {state?.error && (
            <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {state.error}
            </p>
          )}
        </CardBody>
        <CardFooter className="flex justify-end gap-3 p-6 border-t border-line bg-black/5">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => router.push("/profissionais")}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando..." : "Salvar Profissional"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
