"use client";

import { useState, useActionState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, SquarePen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TelefoneInput } from "@/components/ui/TelefoneInput";
import { CepInput, CnsInput } from "@/components/ui/MaskedInput";
import { formatCpf, formatCnpj } from "@/lib/documentos";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
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

/** Normaliza o papel para os valores aceitos pelo Select (default medico). */
function papelDefault(role?: string): string {
  return role && (PAPEIS_FORM as readonly string[]).includes(role) ? role : "medico";
}

/**
 * Campos compartilhados entre criar e editar. As credenciais de acesso
 * (usuário e senha) NÃO são geridas aqui — ficam em "Perfis de Acesso ›
 * Usuários". `mostrarStatus` controla o toggle ativo/inativo.
 */
/** Cabeçalho de seção do formulário. */
/**
 * Diálogo de confirmação de descarte, empilhado por cima do modal principal.
 * Reaproveita o Modal (a pilha global já suporta empilhamento).
 */
function ConfirmarDescarte({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Descartar alterações?"
      className="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Sim, descartar
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        Você tem alterações não salvas. Se sair agora, elas serão perdidas.
      </p>
    </Modal>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-semibold text-brand-600">
        {titulo}
      </legend>
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

function CamposProfissional({
  prefixo,
  defaults,
  mostrarStatus,
  especialidades,
}: {
  prefixo: string;
  defaults: FormDefaults;
  mostrarStatus: boolean;
  especialidades: AttendanceOption[];
}) {
  // Controlados p/ máscara/estado.
  const [telefone, setTelefone] = useState(defaults.phone ?? "");
  // Especialidade atual pode ser um valor legado (texto livre) fora do catálogo;
  // nesse caso incluímos como opção extra para não perder o dado na edição.
  const especialidadeAtual = defaults.specialty ?? "";
  const especialidadeLegada =
    especialidadeAtual !== "" &&
    !especialidades.some((e) => e.value === especialidadeAtual);
  const [personType, setPersonType] = useState(defaults.person_type || "cpf");
  const [documento, setDocumento] = useState(defaults.document ?? "");
  // Endereço controlado p/ autopreenchimento via ViaCEP.
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
    <div className="space-y-5">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <Input
            id={`${prefixo}-genero`}
            name="gender"
            label="Gênero"
            placeholder="Identidade de gênero"
            defaultValue={defaults.gender ?? ""}
          />
        </div>
        <Input
          id={`${prefixo}-mae`}
          name="mother_name"
          label="Nome da mãe"
          placeholder="Nome completo da mãe"
          defaultValue={defaults.mother_name ?? ""}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
          <Input
            id={`${prefixo}-naturalidade`}
            name="birthplace"
            label="Naturalidade"
            placeholder="Cidade/UF de nascimento"
            defaultValue={defaults.birthplace ?? ""}
          />
          <Input
            id={`${prefixo}-nacionalidade`}
            name="nationality"
            label="Nacionalidade"
            placeholder="Ex.: Brasileira"
            defaultValue={defaults.nationality ?? ""}
          />
        </div>
      </Secao>

      {/* ── Tipo de profissional ──────────────────────────────────── */}
      <Secao titulo="Tipo de profissional">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select
            id={`${prefixo}-especialidade`}
            name="specialty"
            label="Especialidade"
            defaultValue={especialidadeAtual}
          >
            <option value="">Selecione...</option>
            {especialidades.map((e) => (
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <div className="pt-1">
          <p className="mb-3 text-sm font-medium text-ink">Endereço completo</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                id={`${prefixo}-logradouro`}
                name="address"
                label="Logradouro"
                placeholder="Rua, avenida..."
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
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
              value={bairro}
              onChange={(e) => setBairro(e.target.value)}
            />
            <Input
              id={`${prefixo}-cidade`}
              name="city"
              label="Cidade"
              placeholder="São Paulo"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
            />
            <Input
              id={`${prefixo}-uf`}
              name="state"
              label="UF"
              placeholder="SP"
              maxLength={2}
              value={uf}
              onChange={(e) => setUf(e.target.value)}
            />
          </div>
        </div>
      </Secao>

      {/* ── Credenciamento do convênio (vários) ───────────────────── */}
      <Secao titulo="Credenciamento do convênio">
        {/* Lista serializada em JSON p/ a Server Action (FormData). */}
        <input type="hidden" name="credentials" value={JSON.stringify(creds)} />

        {creds.length === 0 && (
          <p className="text-sm text-muted">
            Nenhum convênio credenciado. Adicione se o profissional atende por
            convênio.
          </p>
        )}

        <div className="space-y-4">
          {creds.map((c, i) => (
            <div key={i} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted">
                  Convênio #{i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setCreds((p) => p.filter((_, idx) => idx !== i))}
                  aria-label="Remover convênio"
                  className="rounded-lg p-1.5 text-muted hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Input
                  label="Convênio"
                  placeholder="Ex.: Unimed"
                  value={c.convenio}
                  onChange={(e) => setCred(i, { convenio: e.target.value })}
                />
                <Input
                  type="date"
                  label="Data de vigência"
                  value={c.vigencia}
                  onChange={(e) => setCred(i, { vigencia: e.target.value })}
                />
                <Input
                  label="Código do convênio"
                  value={c.convenio_code}
                  onChange={(e) => setCred(i, { convenio_code: e.target.value })}
                />
                <Input
                  label="Código do laboratório"
                  value={c.lab_code}
                  onChange={(e) => setCred(i, { lab_code: e.target.value })}
                />
                <Input
                  label="Login TISS 3.0"
                  value={c.tiss_login}
                  onChange={(e) => setCred(i, { tiss_login: e.target.value })}
                />
                <Input
                  type="password"
                  label="Senha TISS 3.0"
                  autoComplete="new-password"
                  value={c.tiss_password}
                  onChange={(e) => setCred(i, { tiss_password: e.target.value })}
                />
                <Input
                  label="Tag XML"
                  value={c.xml_tag}
                  onChange={(e) => setCred(i, { xml_tag: e.target.value })}
                />
                <Input
                  label="CPF ou Código Convênio"
                  value={c.cpf_or_convenio_code}
                  onChange={(e) =>
                    setCred(i, { cpf_or_convenio_code: e.target.value })
                  }
                />
              </div>
              <div className="mt-3">
                <span className="mb-1.5 block text-sm font-medium text-ink">
                  Recebe pelo convênio
                </span>
                <div className="flex flex-wrap gap-4">
                  {(
                    [
                      ["recebe_eletivo", "Eletivo"],
                      ["recebe_urgencia", "Urgência/Emergência"],
                      ["recebe_internacao", "Internação"],
                    ] as const
                  ).map(([campo, rotulo]) => (
                    <label
                      key={campo}
                      className="flex items-center gap-2 text-sm text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={c[campo]}
                        onChange={(e) => setCred(i, { [campo]: e.target.checked })}
                        className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-200"
                      />
                      {rotulo}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setCreds((p) => [...p, credVazia()])}
        >
          <Plus className="h-4 w-4" /> Adicionar convênio
        </Button>
      </Secao>

      {/* ── Observações ───────────────────────────────────────────── */}
      <Secao titulo="Observações">
        <textarea
          id={`${prefixo}-obs`}
          name="notes"
          rows={3}
          placeholder="Anotações internas sobre o profissional (opcional)"
          defaultValue={defaults.notes ?? ""}
          className="w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </Secao>
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
  especialidades,
}: {
  triggerLabel?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  triggerIcon?: ReactNode;
  especialidades: AttendanceOption[];
}) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createProfessional,
    undefined,
  );
  const router = useRouter();

  // Fecha de verdade (descarta e limpa flags).
  function fecharDeVerdade() {
    setConfirmar(false);
    setDirty(false);
    setOpen(false);
  }

  // Tentativa de fechar (backdrop/ESC/X/Cancelar): confirma se houver alterações.
  function tentarFechar() {
    if (dirty) setConfirmar(true);
    else fecharDeVerdade();
  }

  useEffect(() => {
    if (state?.ok) {
      toast.success("Profissional cadastrado com sucesso!");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fecharDeVerdade();
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
        onClose={tentarFechar}
        title="Novo Profissional"
        subtitle="Preencha os dados do profissional"
        className="max-w-4xl"
        footer={
          <>
            <Button variant="ghost" onClick={tentarFechar}>
              Cancelar
            </Button>
            <Button type="submit" form="form-novo-profissional" disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <form
          id="form-novo-profissional"
          action={formAction}
          onInput={() => setDirty(true)}
        >
          <CamposProfissional
            prefixo="np"
            defaults={{ active: true }}
            mostrarStatus
            especialidades={especialidades}
          />
          {state?.error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {state.error}
            </p>
          )}
        </form>
      </Modal>

      <ConfirmarDescarte
        open={confirmar}
        onCancel={() => setConfirmar(false)}
        onConfirm={fecharDeVerdade}
      />
    </>
  );
}

/**
 * Botão "Editar" por linha + modal pré-preenchido.
 * `id` é fixado na action via bind; o usuário de acesso não é editável aqui.
 */
export function EditarProfissionalModal({
  id,
  edit,
  especialidades,
}: {
  id: string;
  edit: ProfissionalEdit;
  especialidades: AttendanceOption[];
}) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const updateWithId = updateProfessional.bind(null, id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateWithId,
    undefined,
  );
  const router = useRouter();

  function fecharDeVerdade() {
    setConfirmar(false);
    setDirty(false);
    setOpen(false);
  }

  function tentarFechar() {
    if (dirty) setConfirmar(true);
    else fecharDeVerdade();
  }

  useEffect(() => {
    if (state?.ok) {
      toast.success("Profissional atualizado com sucesso!");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fecharDeVerdade();
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
        onClose={tentarFechar}
        title="Editar Profissional"
        subtitle="Atualize os dados do profissional"
        className="max-w-4xl"
        footer={
          <>
            <Button variant="ghost" onClick={tentarFechar}>
              Cancelar
            </Button>
            <Button type="submit" form={formId} disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <form id={formId} action={formAction} onInput={() => setDirty(true)}>
          <CamposProfissional
            prefixo={`ep-${id}`}
            defaults={edit}
            mostrarStatus
            especialidades={especialidades}
          />
          {state?.error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {state.error}
            </p>
          )}
        </form>
      </Modal>

      <ConfirmarDescarte
        open={confirmar}
        onCancel={() => setConfirmar(false)}
        onConfirm={fecharDeVerdade}
      />
    </>
  );
}
