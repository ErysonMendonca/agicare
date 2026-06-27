import { type FilaItem } from "@/lib/data/queue";

export interface FichaImpressaoProps {
  /** Senha emitida no check-in (ticketCode). */
  senha: string;
  /** Dados do agendado/paciente que originou o check-in. */
  item: FilaItem;
  /** Prioridade escolhida no check-in. */
  prioridade: "normal" | "preferencial" | "urgente";
  /** Momento do check-in (default: agora). */
  emitidoEm?: Date;
}

const PRIORIDADE_LABEL: Record<FichaImpressaoProps["prioridade"], string> = {
  normal: "Normal",
  preferencial: "Preferencial",
  urgente: "Urgente",
};

/**
 * Ficha de atendimento impressa após o check-in no totem/recepção.
 * Fica oculta na tela (`hidden`) e só aparece na impressão via @media print,
 * que esconde o restante da interface por visibilidade. Sem CSS global.
 */
export function FichaImpressao({
  senha,
  item,
  prioridade,
  emitidoEm,
}: FichaImpressaoProps) {
  const data = emitidoEm ?? new Date();
  const dataHora = data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .ficha-print, .ficha-print * { visibility: visible !important; }
          .ficha-print {
            display: block !important;
            position: fixed;
            inset: 0;
            margin: 0;
            padding: 32px;
            background: #ffffff;
          }
        }
      `}</style>

      <div className="ficha-print hidden text-ink">
        <div className="mx-auto max-w-md">
          <header className="border-b border-line pb-4 text-center">
            <h1 className="text-xl font-bold tracking-tight text-brand-600">
              agicare
            </h1>
            <p className="text-sm text-muted">Ficha de Atendimento</p>
          </header>

          <div className="my-6 text-center">
            <p className="text-xs uppercase tracking-wide text-muted">Senha</p>
            <p className="text-5xl font-extrabold tracking-tight text-ink">
              {senha}
            </p>
            <p className="mt-1 text-sm font-medium text-muted">
              Prioridade: {PRIORIDADE_LABEL[prioridade]}
            </p>
          </div>

          {item.atendimentoCodigo && (
            <div className="mb-6 rounded-xl border-2 border-dashed border-line py-4 text-center">
              <p className="text-xs uppercase tracking-wide text-muted">
                Nº do Atendimento
              </p>
              <p className="text-3xl font-bold tracking-[0.2em] text-brand-600">
                {item.atendimentoCodigo}
              </p>
              <p className="mt-1 text-xs text-muted">
                Use este número para acompanhar o atendimento.
              </p>
            </div>
          )}

          <dl className="space-y-2 border-t border-line pt-4 text-sm">
            <FichaLinha rotulo="Paciente" valor={item.paciente} />
            <FichaLinha rotulo="Especialidade" valor={item.especialidade} />
            <FichaLinha rotulo="Profissional" valor={item.medico} />
            <FichaLinha rotulo="Convênio" valor={item.convenio} />
            <FichaLinha rotulo="Data / Hora" valor={dataHora} />
          </dl>

          <footer className="mt-6 border-t border-line pt-4 text-center text-xs text-muted">
            Aguarde ser chamado(a) pelo painel. Obrigado!
          </footer>
        </div>
      </div>
    </>
  );
}

function FichaLinha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{rotulo}</dt>
      <dd className="text-right font-semibold text-ink">{valor}</dd>
    </div>
  );
}
