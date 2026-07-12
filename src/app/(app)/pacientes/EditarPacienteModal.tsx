"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { User, MapPin, HeartCrack, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TelefoneInput } from "@/components/ui/TelefoneInput";
import { CpfInput, CnsInput, CepInput } from "@/components/ui/MaskedInput";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import {
  getPacienteEditavel,
  getPacienteCatalogos,
  updatePaciente,
  type ActionState,
} from "@/lib/actions/pacientes";
import { isValidCPF } from "@/lib/cpf";
import { isValidCNS } from "@/lib/cns";
import {
  type AbaId,
  type ViaCep,
  ABA_DO_CAMPO,
  validarTudo,
  ehMenor,
  convenioExigeCarteirinha,
  OPCOES_ACOMODACAO,
} from "./pacienteForm.shared";
import type { PacienteEditavel } from "@/lib/data/patients";

const ABAS = [
  { id: "pessoais", label: "Dados Pessoais", icon: User },
  { id: "contato", label: "Contato e Endereço", icon: MapPin },
  { id: "obito", label: "Histórico e Óbito", icon: HeartCrack },
] as const;

/**
 * Modal CONTROLADO de edição do cadastro do paciente. Reusa o contrato/abas do
 * cadastro (CadastroPacienteModal), mas pré-preenchido com os dados atuais e
 * salvando via `updatePaciente`. Carrega os dados crus sob demanda ao abrir
 * (getPacienteEditavel), para servir tanto à ficha quanto ao kebab da lista
 * (que só têm a linha resumida do paciente).
 *
 * `patientId` nulo = fechado. Em sucesso chama `onSaved` (router.refresh do pai).
 * O `useActionState` vive aqui (pai) para o botão "Salvar" do footer refletir o
 * estado de envio; o form interno só cuida do estado local dos campos.
 */
export function EditarPacienteModal({
  patientId,
  onClose,
  onSaved,
  closeOnSave = true,
}: {
  patientId: string | null;
  onClose: () => void;
  onSaved?: () => void;
  /** Quando false, em sucesso NÃO fecha o modal (ex.: wizard de check-in avulso). */
  closeOnSave?: boolean;
}) {
  const [paciente, setPaciente] = useState<PacienteEditavel | null>(null);
  const [convenios, setConvenios] = useState<string[]>([]);
  const [parentescos, setParentescos] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState(updatePaciente, undefined);
  const processadoRef = useRef<ActionState>(undefined);
  // CPF inválido é içado do form interno para travar o botão "Salvar" do footer.
  const [cpfInvalido, setCpfInvalido] = useState(false);

  // Carrega os dados crus ao MONTAR (o pai monta com `key` por paciente, então
  // cada abertura é um mount novo — sem reset síncrono de estado dentro do
  // effect, que dispararia cascading renders/lint).
  useEffect(() => {
    if (!patientId) return;
    let ativo = true;
    (async () => {
      const [res, cats] = await Promise.all([
        getPacienteEditavel(patientId),
        getPacienteCatalogos(),
      ]);
      if (!ativo) return;
      if (res.error || !res.paciente) {
        setErroCarga(res.error ?? "Paciente não encontrado.");
      } else {
        setPaciente(res.paciente);
        setConvenios(cats.convenios);
        setParentescos(cats.parentescos);
      }
      setCarregando(false);
    })();
    return () => {
      ativo = false;
    };
  }, [patientId]);

  // Processa o resultado da action uma única vez por novo estado.
  useEffect(() => {
    if (!state || state === processadoRef.current) return;
    processadoRef.current = state;
    if (state.error) {
      toast.error(state.error);
      return;
    }
    if (state.ok) {
      toast.success("Cadastro atualizado com sucesso!");
      if (closeOnSave) onClose();
      onSaved?.();
    }
  }, [state, onClose, onSaved, closeOnSave]);

  return (
    <Modal
      open={!!patientId}
      onClose={onClose}
      title="Editar cadastro"
      subtitle={paciente?.full_name ?? "Atualize a ficha do paciente"}
      className="max-w-2xl"
      footer={
        paciente ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-edit-paciente"
              disabled={pending || cpfInvalido}
            >
              {pending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        )
      }
    >
      {carregando && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando dados do
          paciente...
        </div>
      )}

      {erroCarga && !carregando && (
        <p className="rounded-lg bg-red-50 px-3 py-4 text-center text-sm text-red-600">
          {erroCarga}
        </p>
      )}

      {paciente && (
        // key força remontagem (estado inicial fresco) ao trocar de paciente.
        <EditarPacienteForm
          key={paciente.id}
          paciente={paciente}
          convenios={convenios}
          parentescos={parentescos}
          formAction={formAction}
          erro={state?.ok ? undefined : state?.error}
          fieldErrors={state?.ok ? undefined : state?.fieldErrors}
          dados={state?.ok ? undefined : state?.data}
          onCpfValidityChange={setCpfInvalido}
        />
      )}
    </Modal>
  );
}

/**
 * Form interno: inicializa todo o estado a partir do paciente carregado, sem
 * setState-em-effect (graças ao `key` do pai). Mesmas regras do cadastro:
 * feedback de CPF/CNS, ViaCEP no blur do CEP, convênio não-SUS exige plano.
 */
function EditarPacienteForm({
  paciente,
  convenios,
  parentescos,
  formAction,
  erro,
  fieldErrors,
  dados,
  onCpfValidityChange,
}: {
  paciente: PacienteEditavel;
  convenios: string[];
  parentescos: string[];
  formAction: (formData: FormData) => void;
  erro?: string;
  fieldErrors?: Record<string, string[]>;
  dados?: Record<string, string>;
  onCpfValidityChange: (invalido: boolean) => void;
}) {
  const [aba, setAba] = useState<AbaId>("pessoais");

  // Valor inicial: prioriza o eco preservado do servidor (`dados`) sobre o dado
  // carregado do paciente, para não perder edições quando o salvamento falha.
  const ini = (k: keyof PacienteEditavel & string) =>
    dados?.[k] ?? (paciente[k] as string) ?? "";

  // Erros por campo: validação de cliente (submit) + `fieldErrors` do servidor
  // unificados neste estado, para que digitar no campo limpe a borda vermelha.
  const [errosCliente, setErrosCliente] = useState<Record<string, string>>({});
  const erroCampo = (name: string): string | undefined => errosCliente[name];
  const limparErro = (name: string) =>
    setErrosCliente((prev) => {
      if (!prev[name]) return prev;
      const resto = { ...prev };
      delete resto[name];
      return resto;
    });

  const [usaSocial, setUsaSocial] = useState(
    !!(dados?.social_name ?? paciente.social_name),
  );

  const [cpf, setCpf] = useState(ini("cpf"));
  const cpfDigits = cpf.replace(/\D/g, "");
  const cpfInvalido = cpfDigits.length === 11 && !isValidCPF(cpf);

  const [cns, setCns] = useState(ini("cns"));
  const cnsDigits = cns.replace(/\D/g, "");
  const cnsInvalido = cnsDigits.length === 15 && !isValidCNS(cns);

  const [nascimento, setNascimento] = useState(ini("birth_date"));
  const menor = ehMenor(nascimento);

  const [convenio, setConvenio] = useState(ini("convenio"));
  const ehSus = convenio.trim().toLowerCase() === "sus";
  const ehParticular = convenio.trim().toLowerCase() === "particular";
  const exigeCarteirinha = convenioExigeCarteirinha(convenio);
  const exigePlano =
    convenio.trim() !== "" &&
    convenio.toLowerCase() !== "sus" &&
    convenio.toLowerCase() !== "particular";

  const [cep, setCep] = useState(ini("cep"));
  const [endereco, setEndereco] = useState(ini("address"));
  const [bairro, setBairro] = useState(ini("district"));
  const [cidade, setCidade] = useState(ini("city"));
  const [uf, setUf] = useState(ini("uf"));
  const [buscandoCep, setBuscandoCep] = useState(false);

  const [obito, setObito] = useState(!!(dados?.death_date ?? paciente.death_date));

  // Preservação: os campos controlados mantêm o estado React quando o submit
  // falha (o form é montado com `key={paciente.id}`, sem remontar no erro), e os
  // não-controlados são restaurados pelo React via `defaultValue={ini(...)}` (que
  // já reflete o eco `dados`). Só resta saltar para a etapa do 1º erro.
  useEffect(() => {
    if (!dados) return;
    const primeiro = fieldErrors ? Object.keys(fieldErrors)[0] : undefined;
    if (fieldErrors) {
      const map: Record<string, string> = {};
      for (const k in fieldErrors) {
        const v = fieldErrors[k]?.[0];
        if (v) map[k] = v;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setErrosCliente(map);
    }
    if (primeiro) setAba(ABA_DO_CAMPO[primeiro] ?? "pessoais");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados]);

  async function buscarCep(valor: string) {
    const limpo = valor.replace(/\D/g, "");
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const data: ViaCep = await res.json();
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

  const inputTextarea =
    "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {ABAS.map((a) => {
          const Icon = a.icon;
          const ativa = aba === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              className={
                ativa
                  ? "inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white"
                  : "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:bg-black/5 hover:text-ink"
              }
            >
              <Icon className="h-3.5 w-3.5" /> {a.label}
            </button>
          );
        })}
      </div>

      <form
        id="form-edit-paciente"
        action={formAction}
        onSubmit={(e) => {
          const { erros, primeiraAba } = validarTudo(new FormData(e.currentTarget));
          if (primeiraAba) {
            e.preventDefault();
            setErrosCliente(erros);
            setAba(primeiraAba);
            toast.error("Há campos obrigatórios não preenchidos.");
          }
        }}
        className="space-y-4"
      >
        <input type="hidden" name="id" value={paciente.id} />
        {/* Token de optimistic lock (0044): o updated_at carregado na abertura.
            O servidor casa o UPDATE por ele e detecta edição concorrente. */}
        <input type="hidden" name="updated_at" value={paciente.updated_at} />

        {/* Aba 1 — Dados Pessoais */}
        <div className={aba === "pessoais" ? "space-y-4" : "hidden"}>
          <Input
            id="ep-nome"
            name="full_name"
            label="Nome completo *"
            placeholder="Ex.: João Pedro Oliveira"
            defaultValue={ini("full_name")}
            error={erroCampo("full_name")}
            onChange={() => limparErro("full_name")}
          />

          <label className="flex items-center gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={usaSocial}
              onChange={(e) => setUsaSocial(e.target.checked)}
              className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-100"
            />
            Utiliza nome social
          </label>
          {usaSocial && (
            <Input
              id="ep-social"
              name="social_name"
              label="Nome social"
              placeholder="Como deseja ser chamado(a)"
              defaultValue={ini("social_name")}
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <CpfInput
                id="ep-cpf"
                name="cpf"
                label="CPF *"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => {
                  const v = e.target.value;
                  setCpf(v);
                  limparErro("cpf");
                  onCpfValidityChange(
                    v.replace(/\D/g, "").length === 11 && !isValidCPF(v),
                  );
                }}
                error={
                  cpfInvalido
                    ? "CPF inválido (dígito verificador)."
                    : erroCampo("cpf")
                }
              />
            </div>
            <div>
              <CnsInput
                id="ep-cns"
                name="cns"
                label="CNS (Cartão SUS)"
                placeholder="000 0000 0000 0000"
                value={cns}
                onChange={(e) => {
                  setCns(e.target.value);
                  limparErro("cns");
                }}
                error={
                  cnsInvalido
                    ? "CNS inválido (dígito verificador)."
                    : erroCampo("cns")
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="ep-nasc"
              name="birth_date"
              label="Data de nascimento *"
              type="date"
              value={nascimento}
              onChange={(e) => {
                setNascimento(e.target.value);
                limparErro("birth_date");
              }}
              error={erroCampo("birth_date")}
            />
            <Select
              id="ep-genero"
              name="gender"
              label="Gênero *"
              defaultValue={ini("gender")}
              error={erroCampo("gender")}
              onChange={() => limparErro("gender")}
            >
              <option value="">Selecione</option>
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
              <option value="outro">Outro</option>
            </Select>
          </div>

          <Input
            id="ep-mae"
            name="mother_name"
            label="Nome da mãe"
            placeholder="Nome completo da mãe"
            defaultValue={ini("mother_name")}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="ep-natural"
              name="naturality"
              label="Naturalidade"
              placeholder="Cidade de nascimento"
              defaultValue={ini("naturality")}
            />
            <Input
              id="ep-nacional"
              name="nationality"
              label="Nacionalidade"
              defaultValue={ini("nationality") || "Brasileira"}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              id="ep-raca"
              name="race"
              label="Raça/cor"
              defaultValue={ini("race")}
            >
              <option value="">Selecione</option>
              {["Branca", "Preta", "Parda", "Amarela", "Indígena"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
            <Input
              id="ep-etnia"
              name="ethnicity"
              label="Etnia (se indígena)"
              placeholder="Ex.: Guarani"
              defaultValue={ini("ethnicity")}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              id="ep-civil"
              name="marital_status"
              label="Estado civil"
              defaultValue={ini("marital_status")}
            >
              <option value="">Selecione</option>
              {[
                "Solteiro(a)",
                "Casado(a)",
                "Divorciado(a)",
                "Viúvo(a)",
                "União estável",
              ].map((e) => (
                <option key={e}>{e}</option>
              ))}
            </Select>
            <Select
              id="ep-sangue"
              name="blood_type"
              label="Tipo sanguíneo"
              defaultValue={ini("blood_type")}
            >
              <option value="">Selecione</option>
              {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </div>

          {/* Representante legal — só p/ MENORES de idade. */}
          {menor && (
            <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800">
                Paciente menor de idade — informe o representante legal.
              </p>
              <Input
                id="ep-resp"
                name="legal_guardian"
                label="Nome do representante legal *"
                placeholder="Nome completo do responsável"
                defaultValue={ini("legal_guardian")}
                error={erroCampo("legal_guardian")}
                onChange={() => limparErro("legal_guardian")}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <CpfInput
                  id="ep-resp-cpf"
                  name="responsavel_cpf"
                  label="CPF do responsável *"
                  placeholder="000.000.000-00"
                  defaultValue={ini("responsavel_cpf")}
                  error={erroCampo("responsavel_cpf")}
                  onChange={() => limparErro("responsavel_cpf")}
                />
                <Select
                  id="ep-resp-parentesco"
                  name="responsavel_parentesco"
                  label="Parentesco *"
                  defaultValue={ini("responsavel_parentesco")}
                  error={erroCampo("responsavel_parentesco")}
                  onChange={() => limparErro("responsavel_parentesco")}
                >
                  <option value="" disabled>
                    Selecione
                  </option>
                  {(parentescos.length
                    ? parentescos
                    : ["Pai", "Mãe", "Cônjuge", "Filho(a)", "Outro"]
                  ).map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </Select>
                <TelefoneInput
                  id="ep-resp-tel"
                  name="responsavel_telefone"
                  label="Telefone do responsável *"
                  placeholder="(11) 90000-0000"
                  defaultValue={ini("responsavel_telefone")}
                  error={erroCampo("responsavel_telefone")}
                  onChange={() => limparErro("responsavel_telefone")}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              id="ep-conv"
              name="convenio"
              label="Convênio"
              value={convenio}
              onChange={(e) => setConvenio(e.target.value)}
            >
              <option value="">Selecione (opcional)</option>
              {(convenios.includes(convenio) || !convenio
                ? convenios
                : [convenio, ...convenios]
              ).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            {/* Particular não tem plano — o campo some. */}
            {!ehParticular && (
              <Input
                id="ep-plano"
                name="plan"
                label={exigePlano ? "Plano (obrigatório)" : "Plano"}
                placeholder="Ex.: Premium / Apartamento"
                defaultValue={ini("plan")}
                aria-required={exigePlano}
                error={erroCampo("plan")}
              />
            )}
          </div>

          {ehSus && (
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
              Convênio SUS: a carteirinha é o <strong>CNS</strong> informado nos
              dados pessoais.
            </p>
          )}

          {exigeCarteirinha && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="ep-carteirinha"
                name="convenio_carteirinha"
                label="Nº da carteirinha *"
                placeholder="Número da carteira do convênio"
                defaultValue={ini("convenio_carteirinha")}
                error={erroCampo("convenio_carteirinha")}
                onChange={() => limparErro("convenio_carteirinha")}
              />
              <Input
                id="ep-validade"
                name="convenio_validade"
                label="Validade da carteira"
                type="date"
                defaultValue={ini("convenio_validade")}
              />
              <Input
                id="ep-titular"
                name="convenio_titular"
                label="Titular (se dependente)"
                placeholder="Nome do titular do plano"
                defaultValue={ini("convenio_titular")}
              />
              <Select
                id="ep-acomodacao"
                name="convenio_acomodacao"
                label="Acomodação"
                defaultValue={ini("convenio_acomodacao")}
              >
                <option value="">Selecione (opcional)</option>
                {OPCOES_ACOMODACAO.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </Select>
            </div>
          )}

          <Select
            id="ep-origem"
            name="origin"
            label="Origem / Como conheceu a clínica"
            defaultValue={ini("origin")}
          >
            <option value="">Selecione (opcional)</option>
            {[
              "Indicação",
              "Google",
              "Instagram",
              "Redes Sociais",
              "Convênio",
              "Retorno",
              "Passante",
              "Outros",
            ].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        </div>

        {/* Aba 2 — Contato e Endereço */}
        <div className={aba === "contato" ? "space-y-4" : "hidden"}>
          <TelefoneInput
            id="ep-tel"
            name="phone"
            label="Telefone / Celular *"
            placeholder="(11) 90000-0000"
            defaultValue={ini("phone")}
            error={erroCampo("phone")}
            onChange={() => limparErro("phone")}
          />

          <Input
            id="ep-email"
            name="email"
            label="E-mail"
            type="email"
            placeholder="email@exemplo.com"
            defaultValue={ini("email")}
            error={erroCampo("email")}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <CepInput
              id="ep-cep"
              name="cep"
              label={buscandoCep ? "CEP (buscando...)" : "CEP"}
              placeholder="00000-000"
              value={cep}
              onChange={(e) => setCep(e.target.value)}
              onBlur={(e) => buscarCep(e.target.value)}
            />
            <Input
              id="ep-end"
              name="address"
              label="Logradouro *"
              value={endereco}
              onChange={(e) => {
                setEndereco(e.target.value);
                limparErro("address");
              }}
              error={erroCampo("address")}
              className="sm:col-span-2"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              id="ep-bairro"
              name="district"
              label="Bairro"
              value={bairro}
              onChange={(e) => setBairro(e.target.value)}
            />
            <Input
              id="ep-cidade"
              name="city"
              label="Cidade"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
            />
            <Input
              id="ep-uf"
              name="uf"
              label="UF"
              maxLength={2}
              value={uf}
              onChange={(e) => setUf(e.target.value.toUpperCase())}
            />
          </div>
        </div>

        {/* Aba 3 — Histórico e Óbito */}
        <div className={aba === "obito" ? "space-y-4" : "hidden"}>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <label className="flex items-center gap-2.5 text-sm font-medium text-red-700">
              <input
                type="checkbox"
                checked={obito}
                onChange={(e) => setObito(e.target.checked)}
                className="h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-100"
              />
              Registrar óbito (o paciente será marcado como inativo)
            </label>

            {obito && (
              <div className="mt-4 space-y-4">
                <Input
                  id="ep-obito-data"
                  name="death_date"
                  label="Data do óbito"
                  type="date"
                  defaultValue={ini("death_date")}
                />
                <label htmlFor="ep-obito-causa" className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">
                    Causa / observações
                  </span>
                  <textarea
                    id="ep-obito-causa"
                    name="death_cause"
                    rows={3}
                    className={inputTextarea}
                    placeholder="Causa do óbito (se conhecida)"
                    defaultValue={ini("death_cause")}
                  />
                </label>
              </div>
            )}
            {!obito && paciente.death_date && (
              <p className="mt-3 text-xs text-red-600">
                Ao desmarcar e salvar, o paciente é reativado e o registro de
                óbito é removido.
              </p>
            )}
          </div>

          <p className="text-sm text-muted">
            O histórico clínico completo (alergias, condições e evoluções) é
            registrado no Prontuário do paciente.
          </p>
        </div>

        {erro && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {erro}
          </p>
        )}
      </form>
    </>
  );
}
