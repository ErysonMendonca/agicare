import { type FilaItem } from "@/lib/data/queue";

/** Dados do detalhe do atendimento para o documento de impressão. */
export type DadosAtendimentoDoc = {
  especialidade: string;
  profissional: string;
  tipo: string;
  carater: string;
  procedencia: string;
  centroCusto: string;
  origem: string;
  dataEntrada: string;
  gestante: string;
  convenio: string;
  plano: string;
  carteira: string;
  validade: string;
  responsavel: string;
  respDocumento: string;
  respParentesco: string;
  observacoes: string;
  /** Responsável pelo Documento = quem abriu o atendimento (check-in). */
  abertoPor: string;
  /** Função de quem abriu o atendimento (rótulo do papel). */
  abertoPorFuncao: string;
};

/**
 * Documento de impressão do DETALHE DO ATENDIMENTO (Dados de Atendimento).
 * Fica oculto na tela (`hidden`) e só aparece na impressão via @media print
 * (esconde o resto da interface por visibilidade). Mesmo padrão do FichaImpressao.
 */
export function FichaAtendimento({
  item,
  dados,
  emitidoEm,
}: {
  item: FilaItem;
  dados: DadosAtendimentoDoc;
  emitidoEm?: Date;
}) {
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
          .atendimento-print, .atendimento-print * { visibility: visible !important; }
          .atendimento-print {
            display: block !important;
            position: fixed;
            inset: 0;
            margin: 0;
            padding: 32px;
            background: #ffffff;
          }
        }
      `}</style>

      <div className="atendimento-print hidden text-ink">
        <div className="mx-auto max-w-xl">
          <header className="border-b border-line pb-4 text-center">
            <h1 className="text-xl font-bold tracking-tight text-brand-600">
              agicare
            </h1>
            <p className="text-sm text-muted">Detalhe do Atendimento</p>
          </header>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="font-semibold text-ink">{item.paciente}</span>
            {item.atendimentoCodigo && (
              <span className="text-muted">
                Nº do Atendimento:{" "}
                <span className="font-semibold text-ink">
                  {item.atendimentoCodigo}
                </span>
              </span>
            )}
          </div>

          <Secao titulo="Dados do Atendimento">
            <Linha rotulo="Especialidade" valor={dados.especialidade} />
            <Linha rotulo="Profissional" valor={dados.profissional} />
            <Linha rotulo="Tipo de Atendimento" valor={dados.tipo} />
            <Linha rotulo="Caráter" valor={dados.carater} />
            <Linha rotulo="Local Procedência" valor={dados.procedencia} />
            <Linha rotulo="Centro de Custo" valor={dados.centroCusto} />
            <Linha rotulo="Origem" valor={dados.origem} />
            <Linha rotulo="Data de Entrada" valor={dados.dataEntrada} />
            <Linha rotulo="Gestante" valor={dados.gestante} />
          </Secao>

          {(dados.abertoPor || dados.abertoPorFuncao) && (
            <Secao titulo="Responsável pelo Documento">
              <Linha rotulo="Nome" valor={dados.abertoPor} />
              <Linha rotulo="Função" valor={dados.abertoPorFuncao} />
            </Secao>
          )}

          <Secao titulo="Convênio">
            <Linha rotulo="Convênio" valor={dados.convenio} />
            <Linha rotulo="Plano" valor={dados.plano} />
            <Linha rotulo="Carteirinha" valor={dados.carteira} />
            <Linha rotulo="Validade" valor={dados.validade} />
          </Secao>

          {(dados.responsavel || dados.respDocumento || dados.respParentesco) && (
            <Secao titulo="Responsável">
              <Linha rotulo="Nome" valor={dados.responsavel} />
              <Linha rotulo="Documento" valor={dados.respDocumento} />
              <Linha rotulo="Grau Parentesco" valor={dados.respParentesco} />
            </Secao>
          )}

          {dados.observacoes && (
            <Secao titulo="Observação">
              <p className="text-sm text-ink">{dados.observacoes}</p>
            </Secao>
          )}

          {/* Termo de Consentimento e Responsabilidade */}
          <div className="mt-8 border-t border-line pt-4 text-[10px] leading-relaxed text-muted text-justify">
            <p className="font-semibold text-ink uppercase mb-1">Termo de Consentimento e Responsabilidade</p>
            <p>
              Declaro sob as penas da lei que as informações cadastrais prestadas acima são verdadeiras. 
              Autorizo a realização de consultas, exames e procedimentos indicados, consentindo com o tratamento
              médico necessário. Declaro também estar ciente de que as despesas não cobertas pelo meu convênio 
              são de minha inteira responsabilidade, comprometendo-me a quitá-las diretamente com esta instituição.
            </p>
          </div>

          {/* Assinaturas */}
          <div className="mt-12 grid grid-cols-2 gap-8 text-center text-[11px]">
            <div className="border-t border-ink pt-2">
              <p className="font-semibold text-ink">{item.paciente}</p>
              <p className="text-muted">Assinatura do Paciente / Responsável</p>
            </div>
            <div className="border-t border-ink pt-2">
              <p className="font-semibold text-ink">Recepção</p>
              <p className="text-muted">Assinatura do Atendente</p>
            </div>
          </div>

          <footer className="mt-6 border-t border-line pt-4 text-center text-xs text-muted">
            Emitido em {dataHora}
          </footer>
        </div>
      </div>
    </>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 border-b border-line pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {titulo}
      </h2>
      <dl className="space-y-1.5 text-sm">{children}</dl>
    </section>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  if (!valor || valor === "—") return null;
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{rotulo}</dt>
      <dd className="text-right font-semibold text-ink">{valor}</dd>
    </div>
  );
}
