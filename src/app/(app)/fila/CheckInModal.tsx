"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Printer, Ticket, UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { type FilaItem } from "@/lib/data/queue";
import { checkInTotem, atenderRecepcao } from "@/lib/actions/queue";
import { getPacienteEditavel } from "@/lib/actions/pacientes";
import { EditarPacienteModal } from "@/app/(app)/pacientes/EditarPacienteModal";
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
  totemEnabled = true,
  onConfirmarPresenca,
}: {
  agendado: FilaItem | null;
  open: boolean;
  onClose: () => void;
  /** Totem ligado: emite senha (fluxo atual). Desligado: confirma presença. */
  totemEnabled?: boolean;
  /** Sem totem: chamado após confirmar a presença, com a entrada já em 'na_recepcao'. */
  onConfirmarPresenca?: (item: FilaItem) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [prioridade, setPrioridade] = useState<Prioridade>("normal");
  const [senha, setSenha] = useState<string | null>(null);
  const [atendimentoCodigo, setAtendimentoCodigo] = useState<string | null>(null);
  const [emitidoEm, setEmitidoEm] = useState<Date | null>(null);

  // Paciente AVULSO (0049): cadastro mínimo pendente → cadastro completo antes do check-in.
  const avulso = agendado?.registrationComplete === false && !!agendado?.patientId;

  // Wizard do avulso: enquanto não concluir o cadastro completo, a senha fica travada.
  const [cadastroConcluido, setCadastroConcluido] = useState(false);
  // Controla a abertura do EditarPacienteModal (patientId quando aberto, null quando fechado).
  const [editandoId, setEditandoId] = useState<string | null>(null);
  // Dados frescos do paciente após o cadastro completo (o `agendado` é um
  // snapshot do pai e fica defasado — ver nome/convênio recém-preenchidos).
  const [dadosAtuais, setDadosAtuais] = useState<{
    nome: string;
    convenio: string | null;
  } | null>(null);

  // O componente é montado a cada abertura (com key no pai), então o estado
  // inicial já nasce limpo — sem necessidade de reset via efeito.
  if (!agendado) return null;

  // Avulso só libera a emissão da senha depois do cadastro completo concluído.
  const bloqueado = avulso && !cadastroConcluido;
  // Nome/convênio exibidos e enviados: dados frescos quando houver, senão o snapshot.
  const nomeAtual = dadosAtuais?.nome || agendado.paciente;
  const convenioAtual = dadosAtuais ? dadosAtuais.convenio : agendado.convenio;

  function confirmar() {
    if (!agendado) return;
    if (bloqueado) return;
    startTransition(async () => {
      const res = await checkInTotem({
        appointmentId: agendado.appointmentId ?? undefined,
        patientId: agendado.patientId,
        patientName: nomeAtual,
        priority: prioridade,
        specialty: limpar(agendado.especialidade),
        insurance: limpar(convenioAtual),
      });

      if (!res?.ok || !res.queueEntryId) {
        toast.error(res?.error ?? "Não foi possível realizar o check-in.");
        return;
      }

      // Modo SEM totem: confirma a presença e abre os Dados de Atendimento direto.
      if (!totemEnabled) {
        // Recepção "assume" o paciente (aguardando → na_recepcao) para que, ao
        // salvar os Dados, o fluxo avance corretamente. Se falhar, aborta com
        // aviso (não abre os Dados com status "mentiroso").
        const rec = await atenderRecepcao(res.queueEntryId);
        if (rec?.error) {
          toast.error(rec.error);
          router.refresh();
          return;
        }
        toast.success("Presença confirmada.");
        onConfirmarPresenca?.({
          ...agendado,
          id: res.queueEntryId,
          paciente: nomeAtual,
          convenio: limpar(convenioAtual) ?? "",
          statusRaw: "na_recepcao",
          codigo: res.ticketCode ?? "—",
        });
        return;
      }

      // Modo TOTEM: emite a senha (fluxo atual). O nº de atendimento nasce só
      // ao salvar os Dados de Atendimento.
      setSenha(res.ticketCode ?? null);
      setAtendimentoCodigo(null);
      setEmitidoEm(new Date());
      toast.success(`Check-in realizado. Senha ${res.ticketCode ?? ""}.`);
      router.refresh();
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
          : bloqueado
            ? "Cadastro pendente: complete o cadastro do paciente para prosseguir."
            : totemEnabled
              ? "Confirme a prioridade para emitir a senha de atendimento."
              : "Confirme a presença do paciente para iniciar o atendimento."
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
            <Button
              variant="primary"
              onClick={confirmar}
              disabled={pending || bloqueado}
            >
              <UserCheck className="h-4 w-4" />
              {pending
                ? "Confirmando…"
                : totemEnabled
                  ? "Emitir Senha"
                  : "Confirmar presença"}
            </Button>
          </>
        )
      }
    >
      {/* Resumo do agendado (nome/convênio refletem o cadastro recém-salvo) */}
      <div className="rounded-xl border border-line bg-muted-surface p-4">
        <p className="truncate font-semibold text-ink">{nomeAtual}</p>
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
            <span className="font-medium text-ink">{convenioAtual ?? "—"}</span>
          </span>
        </div>
      </div>

      {/* Passo 1 (só avulso, antes de concluir): cadastro completo via EditarPacienteModal. */}
      {!emitida && bloqueado && (
        <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50 p-4">
          <p className="flex items-start gap-2 text-sm text-orange-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Paciente avulso com cadastro pendente. Complete o cadastro do
            paciente para liberar a emissão da senha.
          </p>
          <Button
            variant="primary"
            className="mt-3"
            onClick={() => setEditandoId(agendado.patientId)}
          >
            <UserPlus className="h-4 w-4" />
            Completar cadastro
          </Button>
        </div>
      )}

      {/* Passo 2 (ou paciente já cadastrado): prioridade + emissão. */}
      {!emitida && !bloqueado && (
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
      )}

      {emitida && (
        <div className="mt-5 flex flex-col items-center rounded-xl border border-brand-200 bg-brand-50 py-6">
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-brand-600">
            <Ticket className="h-4 w-4" /> Senha
          </span>
          <span className="mt-1 text-6xl font-extrabold tracking-tight text-brand-700">
            {senha}
          </span>
          {atendimentoCodigo && (
            <span className="mt-3 flex flex-col items-center border-t border-brand-200 pt-3 text-center">
              <span className="text-xs font-medium uppercase tracking-wide text-brand-600">
                Nº do Atendimento
              </span>
              <span className="text-2xl font-bold tracking-[0.2em] text-brand-700">
                {atendimentoCodigo}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Ficha (oculta na tela, visível só na impressão) — usa o nome/convênio
          atuais para não imprimir dados do cadastro mínimo do avulso. */}
      {emitida && senha && (
        <FichaImpressao
          senha={senha}
          item={{ ...agendado, paciente: nomeAtual, convenio: convenioAtual ?? agendado.convenio, atendimentoCodigo }}
          prioridade={prioridade}
          emitidoEm={emitidoEm ?? undefined}
        />
      )}

      {/* Cadastro completo do avulso. closeOnSave=false: ao salvar, NÃO fecha o
          CheckInModal — só conclui o passo 1 e avança para a emissão da senha. */}
      <EditarPacienteModal
        // key por abertura: remonta limpo (sem estado carregando/paciente stale)
        // ao reabrir após cancelar.
        key={editandoId ?? "fechado"}
        patientId={editandoId}
        closeOnSave={false}
        onClose={() => setEditandoId(null)}
        onSaved={async () => {
          setEditandoId(null);
          // Relê o cadastro recém-salvo para refletir nome/convênio atuais na
          // ficha/senha (o `agendado` do pai ainda está defasado neste tick).
          if (agendado.patientId) {
            const r = await getPacienteEditavel(agendado.patientId);
            if ("paciente" in r && r.paciente) {
              setDadosAtuais({
                nome: r.paciente.full_name,
                convenio: r.paciente.convenio?.trim() || null,
              });
            }
          }
          setCadastroConcluido(true);
          router.refresh();
        }}
      />
    </Modal>
  );
}
