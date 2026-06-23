"use client";

import { useState, useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  User,
  MapPin,
  HeartCrack,
  Search,
  Paperclip,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
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
 * Botão "Novo Paciente" + cadastro completo em 3 abas.
 * CPF validado por dígito; CEP preenche endereço via ViaCEP; óbito → inativo.
 * Persiste via Server Action (createPacienteCompleto). Demo: simula sucesso.
 */
export function CadastroPacienteModal() {
  const [open, setOpen] = useState(false);
  const [aba, setAba] = useState<AbaId>("pessoais");
  const [state, formAction, pending] = useActionState(
    createPacienteCompleto,
    undefined,
  );
  const router = useRouter();

  // Nome social (toggle).
  const [usaSocial, setUsaSocial] = useState(false);

  // CPF — feedback de validade no client.
  const [cpf, setCpf] = useState("");
  const cpfDigits = cpf.replace(/\D/g, "");
  const cpfInvalido = cpfDigits.length === 11 && !isValidCPF(cpf);

  // CNS (Cartão SUS) — feedback de validade (15 dígitos, DV oficial).
  const [cns, setCns] = useState("");
  const cnsDigits = cns.replace(/\D/g, "");
  const cnsInvalido = cnsDigits.length === 15 && !isValidCNS(cns);

  // Anti-duplicidade (lupa): consulta paciente já cadastrado por CPF/CNS.
  const [buscandoDoc, setBuscandoDoc] = useState(false);

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
        toast.success(`Nenhum paciente com este ${tipo.toUpperCase()}. Pode prosseguir.`);
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

  // Anexo de prontuário manual (arquivo digitalizado) — enviado ao Storage
  // após criar o paciente (precisa do id/clinic do retorno da action).
  const [manualFile, setManualFile] = useState<File | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  // Garante que cada resultado da action seja processado uma única vez.
  const processadoRef = useRef<ActionState>(undefined);

  // Convênio (não-SUS exige plano).
  const [convenio, setConvenio] = useState("");
  const exigePlano =
    convenio.trim() !== "" &&
    convenio.toLowerCase() !== "sus" &&
    convenio.toLowerCase() !== "particular";

  // CEP → ViaCEP.
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);

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

  // Óbito.
  const [obito, setObito] = useState(false);

  useEffect(() => {
    // Só reage a cada novo resultado da action uma vez (evita re-upload quando
    // o effect re-roda por outras dependências).
    if (!state || state === processadoRef.current) return;
    processadoRef.current = state;

    if (state.error) {
      toast.error(state.error);
      return;
    }
    if (!state.ok) return;

    (async () => {
      // Upload do prontuário manual (se anexado). Mesmo layout do protético:
      // prontuarios/<clinic_id>/<patient_id>/<arquivo>. Sem Supabase (demo),
      // pula o binário. Falha no anexo não invalida o cadastro já criado.
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
            toast.warning(
              `Paciente salvo, mas o anexo falhou: ${upErr.message}`,
            );
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
      setManualFile(null);
      setOpen(false);
      router.refresh();
    })();
  }, [state, router, manualFile]);

  const inputTextarea =
    "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

  // Botão "lupa" (anti-duplicidade) ao lado de CPF/CNS.
  const lupaBtn =
    "inline-flex h-[42px] w-[42px] flex-none items-center justify-center rounded-lg border border-line bg-white text-muted transition-colors hover:border-brand-300 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50";

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Novo Paciente
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Cadastro de Paciente"
        subtitle="Ficha completa em 3 etapas"
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-cad-paciente"
              disabled={pending || cpfInvalido}
            >
              {pending ? "Salvando..." : "Salvar Cadastro"}
            </Button>
          </>
        }
      >
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

        <form id="form-cad-paciente" action={formAction} className="space-y-4">
          {/* Aba 1 — Dados Pessoais */}
          <div className={aba === "pessoais" ? "space-y-4" : "hidden"}>
            <Input
              id="cp-nome"
              name="full_name"
              label="Nome completo"
              placeholder="Ex.: João Pedro Oliveira"
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
                id="cp-social"
                name="social_name"
                label="Nome social"
                placeholder="Como deseja ser chamado(a)"
              />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      id="cp-cpf"
                      name="cpf"
                      label="CPF"
                      placeholder="000.000.000-00"
                      value={cpf}
                      onChange={(e) => setCpf(e.target.value)}
                      aria-invalid={cpfInvalido}
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
                {cpfInvalido && (
                  <p className="mt-1 text-xs text-red-600">
                    CPF inválido (dígito verificador).
                  </p>
                )}
              </div>
              <div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      id="cp-cns"
                      name="cns"
                      label="CNS (Cartão SUS)"
                      placeholder="000 0000 0000 0000"
                      value={cns}
                      onChange={(e) => setCns(e.target.value)}
                      aria-invalid={cnsInvalido}
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
                {cnsInvalido && (
                  <p className="mt-1 text-xs text-red-600">
                    CNS inválido (dígito verificador).
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="cp-nasc"
                name="birth_date"
                label="Data de nascimento"
                type="date"
              />
              <Select id="cp-genero" name="gender" label="Gênero" defaultValue="">
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
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="cp-natural"
                name="naturality"
                label="Naturalidade"
                placeholder="Cidade de nascimento"
              />
              <Input
                id="cp-nacional"
                name="nationality"
                label="Nacionalidade"
                defaultValue="Brasileira"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select id="cp-raca" name="race" label="Raça/cor" defaultValue="">
                <option value="" disabled>
                  Selecione
                </option>
                {["Branca", "Preta", "Parda", "Amarela", "Indígena"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
              <Input
                id="cp-etnia"
                name="ethnicity"
                label="Etnia (se indígena)"
                placeholder="Ex.: Guarani"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                id="cp-civil"
                name="marital_status"
                label="Estado civil"
                defaultValue=""
              >
                <option value="" disabled>
                  Selecione
                </option>
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
                id="cp-sangue"
                name="blood_type"
                label="Tipo sanguíneo"
                defaultValue=""
              >
                <option value="" disabled>
                  Selecione
                </option>
                {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </div>

            <Input
              id="cp-resp"
              name="legal_guardian"
              label="Representante legal (menores)"
              placeholder="Nome do responsável"
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="cp-conv"
                name="convenio"
                label="Convênio"
                placeholder="SUS, Particular, Unimed..."
                value={convenio}
                onChange={(e) => setConvenio(e.target.value)}
              />
              <Input
                id="cp-plano"
                name="plan"
                label={exigePlano ? "Plano (obrigatório)" : "Plano"}
                placeholder="Ex.: Premium / Apartamento"
                aria-required={exigePlano}
              />
            </div>

            <Select
              id="cp-origem"
              name="origin"
              label="Origem / Como conheceu a clínica"
              defaultValue=""
            >
              <option value="" disabled>
                Selecione (opcional)
              </option>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="cp-tel"
                name="phone"
                label="Telefone"
                placeholder="(11) 3456-7890"
              />
              <Input
                id="cp-cel"
                name="cell"
                label="Celular"
                placeholder="(11) 90000-0000"
              />
            </div>

            <Input
              id="cp-email"
              name="email"
              label="E-mail"
              type="email"
              placeholder="email@exemplo.com"
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
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
                label="Logradouro"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
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
                    id="cp-obito-data"
                    name="death_date"
                    label="Data do óbito"
                    type="date"
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
                      if (manualInputRef.current) manualInputRef.current.value = "";
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
