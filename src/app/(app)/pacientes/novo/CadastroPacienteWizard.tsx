"use client";

import { useState, useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  MapPin,
  HeartCrack,
  Search,
  Paperclip,
  X,
  ArrowLeft,
  ArrowRight,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TelefoneInput } from "@/components/ui/TelefoneInput";
import { CpfInput, CnsInput, CepInput } from "@/components/ui/MaskedInput";
import { Select } from "@/components/ui/Select";
import { Card, CardBody, CardFooter } from "@/components/ui/Card";
import {
  createPacienteCompleto,
  buscarPacientePorDocumento,
  anexarProntuarioManual,
  type ActionState,
} from "@/lib/actions/pacientes";
import { isValidCPF } from "@/lib/cpf";
import { isValidCNS } from "@/lib/cns";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import {
  ETAPAS,
  type AbaId,
  type ViaCep,
  ABA_DO_CAMPO,
  validarEtapa,
  validarTudo,
  ehMenor,
  convenioExigeCarteirinha,
  OPCOES_RACA,
  OPCOES_CIVIL,
  OPCOES_SANGUE,
  OPCOES_ACOMODACAO,
  OPCOES_ORIGEM,
} from "../pacienteForm.shared";

const ICONES: Record<AbaId, typeof User> = {
  pessoais: User,
  contato: MapPin,
  obito: HeartCrack,
};

/**
 * Wizard de cadastro de paciente (tela dedicada, 3 etapas). Requisitos:
 *  1. Erro de salvamento aponta QUAL campo falta, pintando o input de vermelho
 *     (erros de cliente por etapa + `fieldErrors` do servidor).
 *  2. Os dados NÃO saem dos inputs em erro/falha — só limpam ao confirmar o
 *     sucesso. Preservação via eco `state.data` (defaults) + re-sync dos campos
 *     controlados; navegar entre etapas não desmonta nada (todas ficam no DOM).
 */
export function CadastroPacienteWizard({
  convenios,
  parentescos,
}: {
  /** Catálogo de convênios da clínica (attendance_options categoria `convenio`). */
  convenios: string[];
  /** Catálogo de parentescos (attendance_options categoria `parentesco`). */
  parentescos: string[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    createPacienteCompleto,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Eco dos dados enviados quando NÃO houve sucesso (preserva o formulário).
  const dados = state?.ok ? undefined : state?.data;
  const dget = (k: string) => dados?.[k] ?? "";

  // Etapa atual do wizard.
  const [etapa, setEtapa] = useState<AbaId>("pessoais");
  const idxEtapa = ETAPAS.findIndex((e) => e.id === etapa);

  // Erros por campo: validação de cliente (por etapa) + `fieldErrors` do servidor
  // são unificados neste estado, para que digitar no campo limpe a borda vermelha
  // (o effect abaixo copia os erros do servidor para cá quando a action retorna).
  const [errosCliente, setErrosCliente] = useState<Record<string, string>>({});
  const erroCampo = (name: string): string | undefined => errosCliente[name];
  const limparErro = (name: string) =>
    setErrosCliente((prev) => {
      if (!prev[name]) return prev;
      const resto = { ...prev };
      delete resto[name];
      return resto;
    });

  // Nome social (toggle).
  const [usaSocial, setUsaSocial] = useState(!!dget("social_name"));

  // CPF — feedback de validade no client.
  const [cpf, setCpf] = useState(() => dget("cpf"));
  const cpfDigits = cpf.replace(/\D/g, "");
  const cpfInvalido = cpfDigits.length === 11 && !isValidCPF(cpf);

  // CNS (Cartão SUS) — feedback de validade (15 dígitos, DV oficial).
  const [cns, setCns] = useState(() => dget("cns"));
  const cnsDigits = cns.replace(/\D/g, "");
  const cnsInvalido = cnsDigits.length === 15 && !isValidCNS(cns);

  // Data de nascimento controlada — reage à idade (menor exige responsável).
  const [nascimento, setNascimento] = useState(() => dget("birth_date"));
  const menor = ehMenor(nascimento);

  // Convênio (não-SUS exige plano; não-Particular/não-SUS exige carteirinha).
  const [convenio, setConvenio] = useState(() => dget("convenio"));
  const ehSus = convenio.trim().toLowerCase() === "sus";
  const ehParticular = convenio.trim().toLowerCase() === "particular";
  const exigeCarteirinha = convenioExigeCarteirinha(convenio);
  const exigePlano =
    convenio.trim() !== "" &&
    convenio.toLowerCase() !== "sus" &&
    convenio.toLowerCase() !== "particular";

  // CEP → ViaCEP (campos controlados p/ preenchimento automático).
  const [cep, setCep] = useState(() => dget("cep"));
  const [endereco, setEndereco] = useState(() => dget("address"));
  const [bairro, setBairro] = useState(() => dget("district"));
  const [cidade, setCidade] = useState(() => dget("city"));
  const [uf, setUf] = useState(() => dget("uf"));
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Óbito.
  const [obito, setObito] = useState(!!dget("death_date"));

  // Anti-duplicidade (lupa).
  const [buscandoDoc, setBuscandoDoc] = useState(false);

  // Anexo de prontuário manual (enviado ao Storage após criar o paciente).
  const [manualFile, setManualFile] = useState<File | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const processadoRef = useRef<ActionState>(undefined);

  // Preservação: os campos CONTROLADOS (cpf/cns/cep/endereço/convênio) mantêm o
  // estado React quando o submit falha (o componente não remonta), e os
  // NÃO-controlados são restaurados pelo React via `defaultValue={dget(...)}`,
  // que já reflete o eco `state.data`. Por isso não é preciso re-sincronizar.

  async function buscarDuplicidade(tipo: "cpf" | "cns") {
    const termo = tipo === "cpf" ? cpf : cns;
    if (!termo.trim()) {
      toast.error(`Informe o ${tipo.toUpperCase()} para buscar.`);
      return;
    }
    setBuscandoDoc(true);
    try {
      const res = await buscarPacientePorDocumento(
        tipo === "cpf" ? { cpf } : { cns },
      );
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const achados = res.encontrados ?? [];
      if (achados.length === 0) {
        toast.success(
          `Nenhum paciente com este ${tipo.toUpperCase()}. Pode prosseguir.`,
        );
      } else {
        toast.warning(
          `Já existe paciente com este ${tipo.toUpperCase()}: ${achados
            .map((p) => p.nome)
            .join(", ")}.`,
        );
      }
    } catch {
      toast.error("Falha ao consultar duplicidade.");
    } finally {
      setBuscandoDoc(false);
    }
  }

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

  // Processa o resultado da action uma única vez por novo estado.
  useEffect(() => {
    if (!state || state === processadoRef.current) return;
    processadoRef.current = state;

    if (state.error && !state.ok) {
      toast.error(state.error);
      const primeiro = state.fieldErrors
        ? Object.keys(state.fieldErrors)[0]
        : undefined;
      // Copia os erros por campo do servidor p/ o estado local (assim digitar no
      // campo limpa a borda) e salta para a etapa do 1º erro.
      if (state.fieldErrors) {
        const map: Record<string, string> = {};
        for (const k in state.fieldErrors) {
          const v = state.fieldErrors[k]?.[0];
          if (v) map[k] = v;
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setErrosCliente(map);
      }
      if (primeiro) setEtapa(ABA_DO_CAMPO[primeiro] ?? "pessoais");
      return;
    }
    if (!state.ok) return;

    (async () => {
      // Upload do prontuário manual (se anexado). Falha no anexo não invalida
      // o cadastro já criado.
      if (manualFile && state.patientId && isSupabaseConfigured()) {
        try {
          const supabase = createClient();
          const path = state.clinicId
            ? `${state.clinicId}/${state.patientId}/${manualFile.name}`
            : `${state.patientId}/${manualFile.name}`;
          const { error: upErr } = await supabase.storage
            .from("prontuarios")
            .upload(path, manualFile, { upsert: true });
          if (upErr) {
            toast.warning(`Paciente salvo, mas o anexo falhou: ${upErr.message}`);
          } else {
            const reg = await anexarProntuarioManual({
              patientId: state.patientId,
              storagePath: path,
              fileName: manualFile.name,
            });
            if (reg?.error) {
              toast.warning(
                `Paciente salvo; anexo enviado mas não vinculado: ${reg.error}`,
              );
            }
          }
        } catch {
          toast.warning("Paciente salvo, mas houve falha ao enviar o anexo.");
        }
      } else if (manualFile && !isSupabaseConfigured()) {
        toast.success("Anexo simulado (modo demonstração).");
      }

      toast.success("Paciente cadastrado com sucesso!");
      router.push("/pacientes");
      router.refresh();
    })();
  }, [state, router, manualFile]);

  /** Valida os obrigatórios da etapa atual antes de avançar. */
  function avancar() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    const erros = validarEtapa(fd, etapa);
    if (Object.keys(erros).length > 0) {
      setErrosCliente((prev) => ({ ...prev, ...erros }));
      toast.error("Preencha os campos obrigatórios desta etapa.");
      return;
    }
    const prox = ETAPAS[idxEtapa + 1];
    if (prox) setEtapa(prox.id);
  }

  function voltar() {
    const ant = ETAPAS[idxEtapa - 1];
    if (ant) setEtapa(ant.id);
  }

  /** Backstop no submit final: valida o formulário inteiro e salta se faltar algo. */
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const { erros, primeiraAba } = validarTudo(fd);
    if (primeiraAba) {
      e.preventDefault();
      setErrosCliente(erros);
      setEtapa(primeiraAba);
      toast.error("Há campos obrigatórios não preenchidos.");
    }
  }

  const inputTextarea =
    "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";
  const lupaBtn =
    "inline-flex h-[42px] w-[42px] flex-none items-center justify-center rounded-lg border border-line bg-white text-muted transition-colors hover:border-brand-300 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50";

  const ultima = idxEtapa === ETAPAS.length - 1;

  return (
    <Card className="w-full">
      {/* Stepper */}
      <div className="border-b border-line px-6 pt-6 sm:px-8">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
          {ETAPAS.map((e, i) => {
            const Icon = ICONES[e.id];
            const ativa = e.id === etapa;
            const feita = i < idxEtapa;
            return (
              <li key={e.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEtapa(e.id)}
                  className={
                    ativa
                      ? "inline-flex items-center gap-2 rounded-full bg-brand-500 px-3.5 py-1.5 text-sm font-medium text-white"
                      : feita
                        ? "inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-sm font-medium text-brand-600"
                        : "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium text-muted hover:bg-black/5"
                  }
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center">
                    {feita ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </span>
                  <span className="hidden sm:inline">{e.label}</span>
                  <span className="sm:hidden">{i + 1}</span>
                </button>
                {i < ETAPAS.length - 1 && (
                  <span className="h-px w-4 bg-line sm:w-8" aria-hidden />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <form
        id="form-cad-paciente"
        ref={formRef}
        action={formAction}
        onSubmit={onSubmit}
      >
        <CardBody className="space-y-4 p-6 sm:p-8">
          {/* Etapa 1 — Dados Pessoais */}
          <div className={etapa === "pessoais" ? "space-y-4" : "hidden"}>
            <Input
              id="cp-nome"
              name="full_name"
              label="Nome completo *"
              placeholder="Ex.: João Pedro Oliveira"
              defaultValue={dget("full_name")}
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
                id="cp-social"
                name="social_name"
                label="Nome social"
                placeholder="Como deseja ser chamado(a)"
                defaultValue={dget("social_name")}
              />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <CpfInput
                      id="cp-cpf"
                      name="cpf"
                      label="CPF *"
                      placeholder="000.000.000-00"
                      value={cpf}
                      onChange={(e) => {
                        setCpf(e.target.value);
                        limparErro("cpf");
                      }}
                      error={
                        cpfInvalido
                          ? "CPF inválido (dígito verificador)."
                          : erroCampo("cpf")
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => buscarDuplicidade("cpf")}
                    disabled={buscandoDoc}
                    aria-label="Verificar CPF já cadastrado"
                    title="Verificar duplicidade por CPF"
                    className={lupaBtn}
                  >
                    <Search className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <CnsInput
                      id="cp-cns"
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
                  <button
                    type="button"
                    onClick={() => buscarDuplicidade("cns")}
                    disabled={buscandoDoc}
                    aria-label="Verificar CNS já cadastrado"
                    title="Verificar duplicidade por CNS"
                    className={lupaBtn}
                  >
                    <Search className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="cp-nasc"
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
                id="cp-genero"
                name="gender"
                label="Gênero *"
                defaultValue={dget("gender")}
                error={erroCampo("gender")}
                onChange={() => limparErro("gender")}
              >
                <option value="" disabled>
                  Selecione
                </option>
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
                <option value="outro">Outro</option>
              </Select>
            </div>

            <Input
              id="cp-mae"
              name="mother_name"
              label="Nome da mãe"
              placeholder="Nome completo da mãe"
              defaultValue={dget("mother_name")}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="cp-natural"
                name="naturality"
                label="Naturalidade"
                placeholder="Cidade de nascimento"
                defaultValue={dget("naturality")}
              />
              <Input
                id="cp-nacional"
                name="nationality"
                label="Nacionalidade"
                defaultValue={dados ? dget("nationality") : "Brasileira"}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                id="cp-raca"
                name="race"
                label="Raça/cor"
                defaultValue={dget("race")}
              >
                <option value="" disabled>
                  Selecione
                </option>
                {OPCOES_RACA.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
              <Input
                id="cp-etnia"
                name="ethnicity"
                label="Etnia (se indígena)"
                placeholder="Ex.: Guarani"
                defaultValue={dget("ethnicity")}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                id="cp-civil"
                name="marital_status"
                label="Estado civil"
                defaultValue={dget("marital_status")}
              >
                <option value="" disabled>
                  Selecione
                </option>
                {OPCOES_CIVIL.map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </Select>
              <Select
                id="cp-sangue"
                name="blood_type"
                label="Tipo sanguíneo"
                defaultValue={dget("blood_type")}
              >
                <option value="" disabled>
                  Selecione
                </option>
                {OPCOES_SANGUE.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </div>

            {/* Representante legal — só aparece/obrigatório p/ MENORES de idade. */}
            {menor && (
              <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800">
                  Paciente menor de idade — informe o representante legal.
                </p>
                <Input
                  id="cp-resp"
                  name="legal_guardian"
                  label="Nome do representante legal *"
                  placeholder="Nome completo do responsável"
                  defaultValue={dget("legal_guardian")}
                  error={erroCampo("legal_guardian")}
                  onChange={() => limparErro("legal_guardian")}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <CpfInput
                    id="cp-resp-cpf"
                    name="responsavel_cpf"
                    label="CPF do responsável *"
                    placeholder="000.000.000-00"
                    defaultValue={dget("responsavel_cpf")}
                    error={erroCampo("responsavel_cpf")}
                    onChange={() => limparErro("responsavel_cpf")}
                  />
                  <Select
                    id="cp-resp-parentesco"
                    name="responsavel_parentesco"
                    label="Parentesco *"
                    defaultValue={dget("responsavel_parentesco")}
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
                    id="cp-resp-tel"
                    name="responsavel_telefone"
                    label="Telefone do responsável *"
                    placeholder="(11) 90000-0000"
                    defaultValue={dget("responsavel_telefone")}
                    error={erroCampo("responsavel_telefone")}
                    onChange={() => limparErro("responsavel_telefone")}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                id="cp-conv"
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
                  id="cp-plano"
                  name="plan"
                  label={exigePlano ? "Plano (obrigatório)" : "Plano"}
                  placeholder="Ex.: Premium / Apartamento"
                  defaultValue={dget("plan")}
                  aria-required={exigePlano}
                  error={erroCampo("plan")}
                />
              )}
            </div>

            {/* SUS: a carteirinha é o CNS (já coletado nos dados pessoais). */}
            {ehSus && (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
                Convênio SUS: a carteirinha é o <strong>CNS</strong> informado
                nos dados pessoais.
              </p>
            )}

            {/* Detalhes do convênio (não-Particular/não-SUS). */}
            {exigeCarteirinha && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  id="cp-carteirinha"
                  name="convenio_carteirinha"
                  label="Nº da carteirinha *"
                  placeholder="Número da carteira do convênio"
                  defaultValue={dget("convenio_carteirinha")}
                  error={erroCampo("convenio_carteirinha")}
                  onChange={() => limparErro("convenio_carteirinha")}
                />
                <Input
                  id="cp-validade"
                  name="convenio_validade"
                  label="Validade da carteira"
                  type="date"
                  defaultValue={dget("convenio_validade")}
                />
                <Input
                  id="cp-titular"
                  name="convenio_titular"
                  label="Titular (se dependente)"
                  placeholder="Nome do titular do plano"
                  defaultValue={dget("convenio_titular")}
                />
                <Select
                  id="cp-acomodacao"
                  name="convenio_acomodacao"
                  label="Acomodação"
                  defaultValue={dget("convenio_acomodacao")}
                >
                  <option value="">Selecione (opcional)</option>
                  {OPCOES_ACOMODACAO.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </Select>
              </div>
            )}

            <Select
              id="cp-origem"
              name="origin"
              label="Origem / Como conheceu a clínica"
              defaultValue={dget("origin")}
            >
              <option value="" disabled>
                Selecione (opcional)
              </option>
              {OPCOES_ORIGEM.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </Select>
          </div>

          {/* Etapa 2 — Contato e Endereço */}
          <div className={etapa === "contato" ? "space-y-4" : "hidden"}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TelefoneInput
                id="cp-tel"
                name="phone"
                label="Telefone *"
                placeholder="(11) 3456-7890"
                defaultValue={dget("phone")}
                error={erroCampo("phone")}
                onChange={() => limparErro("phone")}
              />
              <TelefoneInput
                id="cp-cel"
                name="cell"
                label="Celular"
                placeholder="(11) 90000-0000"
                defaultValue={dget("cell")}
                onChange={() => limparErro("phone")}
              />
            </div>

            <Input
              id="cp-email"
              name="email"
              label="E-mail"
              type="email"
              placeholder="email@exemplo.com"
              defaultValue={dget("email")}
              error={erroCampo("email")}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <CepInput
                id="cp-cep"
                name="cep"
                label={buscandoCep ? "CEP (buscando...)" : "CEP"}
                placeholder="00000-000"
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                onBlur={(e) => buscarCep(e.target.value)}
              />
              <Input
                id="cp-end"
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
                id="cp-bairro"
                name="district"
                label="Bairro"
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
              />
              <Input
                id="cp-cidade"
                name="city"
                label="Cidade"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
              />
              <Input
                id="cp-uf"
                name="uf"
                label="UF"
                maxLength={2}
                value={uf}
                onChange={(e) => setUf(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          {/* Etapa 3 — Histórico e Óbito */}
          <div className={etapa === "obito" ? "space-y-4" : "hidden"}>
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
                    id="cp-obito-data"
                    name="death_date"
                    label="Data do óbito"
                    type="date"
                    defaultValue={dget("death_date")}
                  />
                  <label htmlFor="cp-obito-causa" className="block">
                    <span className="mb-1.5 block text-sm font-medium text-ink">
                      Causa / observações
                    </span>
                    <textarea
                      id="cp-obito-causa"
                      name="death_cause"
                      rows={3}
                      className={inputTextarea}
                      placeholder="Causa do óbito (se conhecida)"
                      defaultValue={dget("death_cause")}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Anexo de prontuário manual (digitalização das fichas físicas) */}
            <div className="rounded-xl border border-line p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <Paperclip className="h-4 w-4 text-brand-500" /> Prontuário manual
                (anexo)
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Digitalização das fichas físicas anteriores (PDF/imagem). Fica
                disponível no prontuário eletrônico do paciente.
              </p>

              {manualFile ? (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-white p-3">
                  <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Paperclip className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {manualFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setManualFile(null);
                      if (manualInputRef.current)
                        manualInputRef.current.value = "";
                    }}
                    aria-label="Remover anexo"
                    className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => manualInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4" /> Selecionar arquivo
                </Button>
              )}
              <input
                ref={manualInputRef}
                type="file"
                accept=".pdf,image/*"
                className="sr-only"
                aria-hidden
                onChange={(e) => setManualFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <p className="text-sm text-muted">
              O histórico clínico completo (alergias, condições e evoluções) é
              registrado no Prontuário do paciente.
            </p>
          </div>

          {state?.error && !state.ok && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {state.error}
            </p>
          )}
        </CardBody>

        <CardFooter className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-line bg-muted-surface p-6 sm:flex-row sm:items-center sm:px-8">
          <div>
            {idxEtapa > 0 && (
              <Button type="button" variant="ghost" onClick={voltar}>
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
            )}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push("/pacientes")}
            >
              Cancelar
            </Button>
            {ultima ? (
              <Button
                type="submit"
                disabled={pending || cpfInvalido || cnsInvalido}
              >
                {pending ? "Salvando..." : "Salvar Cadastro"}
              </Button>
            ) : (
              <Button type="button" onClick={avancar}>
                Avançar <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
