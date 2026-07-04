"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { IdCard, MapPin, AtSign, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardBody } from "@/components/ui/Card";
import { TelefoneInput } from "@/components/ui/TelefoneInput";
import { CepInput } from "@/components/ui/MaskedInput";
import type { MyAccount } from "@/lib/data/account";
import {
  updateMyAccount,
  changeUsername,
  changePassword,
} from "@/lib/actions/account";

/** Resposta padrão das actions de conta. */
type ActionResult = { ok?: boolean; error?: string } | undefined;

/** Retorno da consulta de CEP (ViaCEP). */
type ViaCep = {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

/** Animação discreta de entrada por seção (respeitando reduce-motion via CSS do projeto). */
const sectionMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

/** Título de seção com ícone — mesmo idioma visual dos cards do sistema. */
function SectionTitle({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof IdCard;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-sm text-muted">{desc}</p>
      </div>
    </div>
  );
}

export function MinhaContaClient({ acc }: { acc: MyAccount }) {
  const router = useRouter();

  // Executa uma action e trata o retorno { ok?, error? } de forma uniforme.
  function run(
    fn: () => Promise<ActionResult>,
    successMsg: string,
    start: (cb: () => void) => void,
  ) {
    start(async () => {
      try {
        const res = await fn();
        if (res?.error) {
          toast.error(res.error);
          return;
        }
        toast.success(successMsg);
        router.refresh();
      } catch {
        toast.error("Não foi possível concluir. Tente novamente.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <DadosCadastrais acc={acc} run={run} />
      <LoginAcesso acc={acc} run={run} />
      <Senha run={run} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seção 1 — Dados cadastrais                                         */
/* ------------------------------------------------------------------ */

function DadosCadastrais({
  acc,
  run,
}: {
  acc: MyAccount;
  run: (
    fn: () => Promise<ActionResult>,
    msg: string,
    start: (cb: () => void) => void,
  ) => void;
}) {
  const [pending, startTransition] = useTransition();

  const [fullName, setFullName] = useState(acc.full_name ?? "");
  const [socialName, setSocialName] = useState(acc.social_name ?? "");
  const [birthDate, setBirthDate] = useState(acc.birth_date ?? "");
  const [sex, setSex] = useState(acc.sex ?? "");
  const [phone, setPhone] = useState(acc.phone ?? "");
  const [contactEmail, setContactEmail] = useState(acc.contactEmail ?? "");

  const [cep, setCep] = useState(acc.cep ?? "");
  const [address, setAddress] = useState(acc.address ?? "");
  const [number, setNumber] = useState(acc.address_number ?? "");
  const [complement, setComplement] = useState(acc.complement ?? "");
  const [neighborhood, setNeighborhood] = useState(acc.neighborhood ?? "");
  const [city, setCity] = useState(acc.city ?? "");
  const [state, setState] = useState(acc.state ?? "");
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Autofill de endereço via ViaCEP (mesmo padrão do CadastroPacienteModal).
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
      setAddress(data.logradouro ?? "");
      setNeighborhood(data.bairro ?? "");
      setCity(data.localidade ?? "");
      setState(data.uf ?? "");
    } catch {
      toast.error("Não foi possível consultar o CEP.");
    } finally {
      setBuscandoCep(false);
    }
  }

  function salvar() {
    run(
      () =>
        updateMyAccount({
          full_name: fullName.trim(),
          social_name: socialName.trim(),
          birth_date: birthDate,
          sex,
          phone: phone.trim(),
          contactEmail: contactEmail.trim(),
          cep: cep.trim(),
          address: address.trim(),
          address_number: number.trim(),
          complement: complement.trim(),
          neighborhood: neighborhood.trim(),
          city: city.trim(),
          state: state.trim(),
        }),
      "Dados atualizados com sucesso.",
      startTransition,
    );
  }

  return (
    <motion.section {...sectionMotion} transition={{ duration: 0.25 }}>
      <Card>
        <CardBody className="space-y-5">
          <SectionTitle
            icon={IdCard}
            title="Dados cadastrais"
            desc="Suas informações pessoais e de contato."
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="mc-nome"
              label="Nome completo"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Seu nome completo"
              autoComplete="name"
            />
            <Input
              id="mc-social"
              label="Nome social"
              value={socialName}
              onChange={(e) => setSocialName(e.target.value)}
              placeholder="Como deseja ser chamado(a)"
            />
            <Input
              id="mc-nasc"
              label="Data de nascimento"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
            <Select
              id="mc-sexo"
              label="Sexo"
              value={sex}
              onChange={(e) => setSex(e.target.value)}
            >
              <option value="">Não informado</option>
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
              <option value="intersexo">Intersexo</option>
            </Select>
            <TelefoneInput
              id="mc-tel"
              label="Telefone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 90000-0000"
            />
            <Input
              id="mc-email"
              label="E-mail de contato"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="email@exemplo.com"
              autoComplete="email"
            />
          </div>

          <div className="flex items-center gap-2 pt-1 text-sm font-medium text-ink">
            <MapPin className="h-4 w-4 text-brand-500" />
            Endereço
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <CepInput
              id="mc-cep"
              label={buscandoCep ? "CEP (buscando...)" : "CEP"}
              value={cep}
              onChange={(e) => setCep(e.target.value)}
              onBlur={(e) => buscarCep(e.target.value)}
              placeholder="00000-000"
              autoComplete="postal-code"
            />
            <Input
              id="mc-log"
              label="Logradouro"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="sm:col-span-2"
              autoComplete="address-line1"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              id="mc-num"
              label="Número"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              inputMode="numeric"
            />
            <Input
              id="mc-compl"
              label="Complemento"
              value={complement}
              onChange={(e) => setComplement(e.target.value)}
              placeholder="Apto, bloco..."
              className="sm:col-span-2"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              id="mc-bairro"
              label="Bairro"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
            />
            <Input
              id="mc-cidade"
              label="Cidade"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
            <Input
              id="mc-uf"
              label="UF"
              maxLength={2}
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={salvar} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? "Salvando..." : "Salvar dados"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </motion.section>
  );
}

/* ------------------------------------------------------------------ */
/* Seção 2 — Login de acesso                                          */
/* ------------------------------------------------------------------ */

function LoginAcesso({
  acc,
  run,
}: {
  acc: MyAccount;
  run: (
    fn: () => Promise<ActionResult>,
    msg: string,
    start: (cb: () => void) => void,
  ) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [username, setUsername] = useState(acc.username ?? "");

  function salvar() {
    run(
      () => changeUsername({ username: username.trim() }),
      "Usuário de acesso atualizado.",
      startTransition,
    );
  }

  return (
    <motion.section {...sectionMotion} transition={{ duration: 0.25, delay: 0.05 }}>
      <Card>
        <CardBody className="space-y-5">
          <SectionTitle
            icon={AtSign}
            title="Login de acesso"
            desc="O nome de usuário usado para entrar no sistema."
          />

          <p className="text-sm text-muted">
            Usuário atual:{" "}
            <span className="font-medium text-ink">
              {acc.username ?? "não definido"}
            </span>
          </p>

          <div className="max-w-sm">
            <Input
              id="mc-username"
              label="Usuário de acesso"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              hint="3-40: minúsculas, números, . _ -"
              placeholder="ex.: maria.silva"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={salvar} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? "Salvando..." : "Salvar usuário"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </motion.section>
  );
}

/* ------------------------------------------------------------------ */
/* Seção 3 — Senha                                                    */
/* ------------------------------------------------------------------ */

function Senha({
  run,
}: {
  run: (
    fn: () => Promise<ActionResult>,
    msg: string,
    start: (cb: () => void) => void,
  ) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function salvar() {
    run(
      async () => {
        const res = await changePassword({
          currentPassword,
          newPassword,
          confirmPassword,
        });
        if (!res?.error) {
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        }
        return res;
      },
      "Senha alterada com sucesso.",
      startTransition,
    );
  }

  return (
    <motion.section {...sectionMotion} transition={{ duration: 0.25, delay: 0.1 }}>
      <Card>
        <CardBody className="space-y-5">
          <SectionTitle
            icon={KeyRound}
            title="Senha"
            desc="Altere sua senha de acesso periodicamente."
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              id="mc-senha-atual"
              label="Senha atual"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
            <Input
              id="mc-senha-nova"
              label="Nova senha"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Input
              id="mc-senha-conf"
              label="Confirmar nova senha"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={salvar} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? "Alterando..." : "Alterar senha"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </motion.section>
  );
}
