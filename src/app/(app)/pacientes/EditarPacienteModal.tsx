"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { User, MapPin, HeartCrack, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TelefoneInput } from "@/components/ui/TelefoneInput";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import {
  getPacienteEditavel,
  updatePaciente,
  type ActionState,
} from "@/lib/actions/pacientes";
import { isValidCPF } from "@/lib/cpf";
import { isValidCNS } from "@/lib/cns";
import type { PacienteEditavel } from "@/lib/data/patients";

const ABAS = [
  { id: "pessoais", label: "Dados Pessoais", icon: User },
  { id: "contato", label: "Contato e Endereço", icon: MapPin },
  { id: "obito", label: "Histórico e Óbito", icon: HeartCrack },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

type ViaCep = {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

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
      const res = await getPacienteEditavel(patientId);
      if (!ativo) return;
      if (res.error || !res.paciente) {
        setErroCarga(res.error ?? "Paciente não encontrado.");
      } else {
        setPaciente(res.paciente);
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
          formAction={formAction}
          erro={state?.error}
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
  formAction,
  erro,
  onCpfValidityChange,
}: {
  paciente: PacienteEditavel;
  formAction: (formData: FormData) => void;
  erro?: string;
  onCpfValidityChange: (invalido: boolean) => void;
}) {
  const [aba, setAba] = useState<AbaId>("pessoais");

  const [usaSocial, setUsaSocial] = useState(!!paciente.social_name);

  const [cpf, setCpf] = useState(paciente.cpf);
  const cpfDigits = cpf.replace(/\D/g, "");
  const cpfInvalido = cpfDigits.length === 11 && !isValidCPF(cpf);

  const [cns, setCns] = useState(paciente.cns);
  const cnsDigits = cns.replace(/\D/g, "");
  const cnsInvalido = cnsDigits.length === 15 && !isValidCNS(cns);

  const [convenio, setConvenio] = useState(paciente.convenio);
  const exigePlano =
    convenio.trim() !== "" &&
    convenio.toLowerCase() !== "sus" &&
    convenio.toLowerCase() !== "particular";

  const [cep, setCep] = useState(paciente.cep);
  const [endereco, setEndereco] = useState(paciente.address);
  const [bairro, setBairro] = useState(paciente.district);
  const [cidade, setCidade] = useState(paciente.city);
  const [uf, setUf] = useState(paciente.uf);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const [obito, setObito] = useState(!!paciente.death_date);

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

      <form id="form-edit-paciente" action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={paciente.id} />
        {/* Token de optimistic lock (0044): o updated_at carregado na abertura.
            O servidor casa o UPDATE por ele e detecta edição concorrente. */}
        <input type="hidden" name="updated_at" value={paciente.updated_at} />

        {/* Aba 1 — Dados Pessoais */}
        <div className={aba === "pessoais" ? "space-y-4" : "hidden"}>
          <Input
            id="ep-nome"
            name="full_name"
            label="Nome completo"
            placeholder="Ex.: João Pedro Oliveira"
            defaultValue={paciente.full_name}
            required
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
              defaultValue={paciente.social_name}
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Input
                id="ep-cpf"
                name="cpf"
                label="CPF"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => {
                  const v = e.target.value;
                  setCpf(v);
                  onCpfValidityChange(
                    v.replace(/\D/g, "").length === 11 && !isValidCPF(v),
                  );
                }}
                aria-invalid={cpfInvalido}
              />
              {cpfInvalido && (
                <p className="mt-1 text-xs text-red-600">
                  CPF inválido (dígito verificador).
                </p>
              )}
            </div>
            <div>
              <Input
                id="ep-cns"
                name="cns"
                label="CNS (Cartão SUS)"
                placeholder="000 0000 0000 0000"
                value={cns}
                onChange={(e) => setCns(e.target.value)}
                aria-invalid={cnsInvalido}
              />
              {cnsInvalido && (
                <p className="mt-1 text-xs text-red-600">
                  CNS inválido (dígito verificador).
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="ep-nasc"
              name="birth_date"
              label="Data de nascimento"
              type="date"
              defaultValue={paciente.birth_date}
            />
            <Select
              id="ep-genero"
              name="gender"
              label="Gênero"
              defaultValue={paciente.gender}
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
            defaultValue={paciente.mother_name}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="ep-natural"
              name="naturality"
              label="Naturalidade"
              placeholder="Cidade de nascimento"
              defaultValue={paciente.naturality}
            />
            <Input
              id="ep-nacional"
              name="nationality"
              label="Nacionalidade"
              defaultValue={paciente.nationality || "Brasileira"}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              id="ep-raca"
              name="race"
              label="Raça/cor"
              defaultValue={paciente.race}
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
              defaultValue={paciente.ethnicity}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              id="ep-civil"
              name="marital_status"
              label="Estado civil"
              defaultValue={paciente.marital_status}
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
              defaultValue={paciente.blood_type}
            >
              <option value="">Selecione</option>
              {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </div>

          <Input
            id="ep-resp"
            name="legal_guardian"
            label="Representante legal (menores)"
            placeholder="Nome do responsável"
            defaultValue={paciente.legal_guardian}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="ep-conv"
              name="convenio"
              label="Convênio"
              placeholder="SUS, Particular, Unimed..."
              value={convenio}
              onChange={(e) => setConvenio(e.target.value)}
            />
            <Input
              id="ep-plano"
              name="plan"
              label={exigePlano ? "Plano (obrigatório)" : "Plano"}
              placeholder="Ex.: Premium / Apartamento"
              defaultValue={paciente.plan}
              aria-required={exigePlano}
            />
          </div>

          <Select
            id="ep-origem"
            name="origin"
            label="Origem / Como conheceu a clínica"
            defaultValue={paciente.origin}
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
            label="Telefone / Celular"
            placeholder="(11) 90000-0000"
            defaultValue={paciente.phone}
          />

          <Input
            id="ep-email"
            name="email"
            label="E-mail"
            type="email"
            placeholder="email@exemplo.com"
            defaultValue={paciente.email}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
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
              label="Logradouro"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
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
                  defaultValue={paciente.death_date}
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
                    defaultValue={paciente.death_cause}
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
