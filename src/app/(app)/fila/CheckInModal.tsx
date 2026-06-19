"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer, Ticket, UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { type FilaItem } from "@/lib/data/queue";
import { checkInTotem } from "@/lib/actions/queue";
import { completarCadastroAvulso } from "@/lib/actions/pacientes";
import { FichaImpressao } from "./FichaImpressao";

type Prioridade = "normal" | "preferencial" | "urgente";

const PRIORIDADES: { value: Prioridade; label: string; classe: string }[] = [
  {
    value: "normal",
    label: "Normal",
    classe: "data-[on=true]:border-brand-500 data-[on=true]:bg-brand-50 data-[on=true]:text-brand-600",
  },
  {
    value: "preferencial",
    label: "Preferencial",
    classe:
      "data-[on=true]:border-orange-400 data-[on=true]:bg-orange-50 data-[on=true]:text-orange-600",
  },
  {
    value: "urgente",
    label: "Urgente",
    classe:
      "data-[on=true]:border-red-400 data-[on=true]:bg-red-50 data-[on=true]:text-red-600",
  },
];

/** Normaliza placeholders ("—") para null antes de enviar ao backend. */
function limpar(v: string | null | undefined): string | null {
  if (!v || v === "—") return null;
  return v;
}

export function CheckInModal({
  agendado,
  open,
  onClose,
}: {
  agendado: FilaItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [prioridade, setPrioridade] = useState<Prioridade>("normal");
  const [senha, setSenha] = useState<string | null>(null);
  const [emitidoEm, setEmitidoEm] = useState<Date | null>(null);

  // Paciente AVULSO (0049): cadastro mínimo pendente → completar antes do check-in.
  const avulso = agendado?.registrationComplete === false && !!agendado?.patientId;

  // Campos do complemento de cadastro (só usados quando avulso).
  const [nome, setNome] = useState(agendado?.paciente ?? "");
  const [nascimento, setNascimento] = useState("");
  const [email, setEmail] = useState("");
  const [convenio, setConvenio] = useState("");
  const [plano, setPlano] = useState("");

  // O componente é montado a cada abertura (com key no pai), então o estado
  // inicial já nasce limpo — sem necessidade de reset via efeito.
  if (!agendado) return null;

  function confirmar() {
    if (!agendado) return;
    startTransition(async () => {
      // Avulso: completa o cadastro (registration_complete=true) ANTES do check-in.
      if (avulso && agendado.patientId) {
        const comp = await completarCadastroAvulso({
          id: agendado.patientId,
          full_name: nome,
          birth_date: nascimento,
          email: email || undefined,
          convenio: convenio || undefined,
          plan: plano || undefined,
        });
        if (!comp.ok) {
          toast.error(comp.error ?? "Não foi possível completar o cadastro.");
          return;
        }
      }

      const res = await checkInTotem({
        appointmentId: agendado.appointmentId ?? undefined,
        patientId: agendado.patientId,
        patientName: avulso ? nome : agendado.paciente,
        priority: prioridade,
        specialty: limpar(agendado.especialidade),
        insurance: avulso ? convenio || null : limpar(agendado.convenio),
      });

      if (res?.ticketCode) {
        setSenha(res.ticketCode);
        setEmitidoEm(new Date());
        toast.success(`Check-in realizado. Senha ${res.ticketCode}.`);
        // Atualiza as listas (paciente sai de "agendados" e entra na fila).
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível realizar o check-in.");
      }
    });
  }

  function concluir() {
    onClose();
  }

  const emitida = senha !== null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={emitida ? "Senha emitida" : "Check-in do Paciente"}
      subtitle={
        emitida
          ? "Imprima a ficha e oriente o paciente a aguardar a chamada."
          : avulso
            ? "Cadastro pendente: complete os dados do paciente para emitir a senha."
            : "Confirme a prioridade para emitir a senha de atendimento."
      }
      footer={
        emitida ? (
          <>
            <Button variant="ghost" onClick={concluir}>
              Concluir
            </Button>
            <Button variant="primary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Imprimir Ficha
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={confirmar} disabled={pending}>
              <UserCheck className="h-4 w-4" />
              {pending
                ? "Emitindo…"
                : avulso
                  ? "Completar e Emitir Senha"
                  : "Confirmar e Emitir Senha"}
            </Button>
          </>
        )
      }
    >
      {/* Resumo do agendado */}
      <div className="rounded-xl border border-line bg-muted-surface p-4">
        <p className="truncate font-semibold text-ink">{agendado.paciente}</p>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          <span>
            Especialidade:{" "}
            <span className="font-medium text-ink">{agendado.especialidade}</span>
          </span>
          <span>
            Profissional:{" "}
            <span className="font-medium text-ink">{agendado.medico}</span>
          </span>
          <span>
            Convênio:{" "}
            <span className="font-medium text-ink">{agendado.convenio}</span>
          </span>
        </div>
      </div>

      {!emitida && avulso && (
        <fieldset className="mt-5">
          <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium text-ink">
            <UserPlus className="h-4 w-4 text-brand-500" />
            Complementar cadastro
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              id="avulso-nome"
              label="Nome completo *"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do paciente"
            />
            <Input
              id="avulso-nascimento"
              label="Data de nascimento *"
              type="date"
              value={nascimento}
              onChange={(e) => setNascimento(e.target.value)}
            />
            <Input
              id="avulso-email"
              label="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="opcional"
            />
            <Input
              id="avulso-convenio"
              label="Convênio"
              value={convenio}
              onChange={(e) => setConvenio(e.target.value)}
              placeholder="Particular, Unimed…"
            />
            {convenio.trim() &&
              convenio.trim().toLowerCase() !== "sus" &&
              convenio.trim().toLowerCase() !== "particular" && (
                <Input
                  id="avulso-plano"
                  label="Plano *"
                  value={plano}
                  onChange={(e) => setPlano(e.target.value)}
                  placeholder="Plano do convênio"
                />
              )}
          </div>
        </fieldset>
      )}

      {!emitida ? (
        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium text-ink">Prioridade</legend>
          <div className="grid grid-cols-3 gap-2">
            {PRIORIDADES.map((p) => (
              <button
                key={p.value}
                type="button"
                data-on={prioridade === p.value}
                aria-pressed={prioridade === p.value}
                onClick={() => setPrioridade(p.value)}
                className={`h-10 rounded-lg border border-line bg-white text-sm font-semibold text-muted transition-colors hover:bg-muted-surface ${p.classe}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>
      ) : (
        <div className="mt-5 flex flex-col items-center rounded-xl border border-brand-200 bg-brand-50 py-6">
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-brand-600">
            <Ticket className="h-4 w-4" /> Senha
          </span>
          <span className="mt-1 text-6xl font-extrabold tracking-tight text-brand-700">
            {senha}
          </span>
        </div>
      )}

      {/* Ficha (oculta na tela, visível só na impressão) */}
      {emitida && senha && (
        <FichaImpressao
          senha={senha}
          item={agendado}
          prioridade={prioridade}
          emitidoEm={emitidoEm ?? undefined}
        />
      )}
    </Modal>
  );
}
