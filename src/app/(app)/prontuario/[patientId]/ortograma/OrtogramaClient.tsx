"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Eraser, Save, Info, Printer, History, FileClock } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { DenteSvg } from "@/components/clinico/DenteSvg";
import { DenteOclusalSvg } from "@/components/clinico/DenteOclusalSvg";
import { cn } from "@/lib/utils";
import {
  ARCO_INFERIOR,
  ARCO_SUPERIOR,
  MARCACOES,
  MARCACAO_CORES,
  MARCACAO_LABELS,
  MARCACAO_SIMBOLOS,
  TODOS_OS_DENTES,
  aplicarMarcacao,
  calcularResumo,
  isAusente,
  isHigido,
  marcasDoDente,
  observacoesAutomaticas,
  type Marca,
  type Marcacao,
} from "@/lib/clinico/ortograma.shared";
import {
  carregarOrtograma,
  salvarOrtograma,
  type OrtogramaVersao,
} from "@/lib/actions/ortograma";
import { imprimirOrtograma } from "./OrtogramaImpressao";
import { type ClinicaImpressao } from "@/lib/clinico/documento-impressao";
import { DocumentActions } from "@/components/clinico/DocumentActions";
import { CancelarDocumentoModal } from "@/components/clinico/CancelarDocumentoModal";
import { cancelarDocumento } from "@/lib/actions/documento-cancelamento";

/** Ferramenta ativa: uma marcação, a borracha, ou nenhuma. */
type Ferramenta = Marcacao | "borracha" | null;

/** Índice do último dente do lado DIREITO do paciente — a linha média vem depois dele. */
const ULTIMO_DIREITA = 7;

const COR_HIGIDO = "var(--color-neutral)";

/** Uma linha do painel "Ortogramas anteriores" (data já formatada no servidor). */
export interface OrtogramaHistoricoItem {
  id: string;
  createdAt: string;
  dataLabel: string;
  professionalName: string;
  totalMarcas: number;
  /** Nº do atendimento (queue_entries.attendance_code); null = avulso/legado. */
  atendimentoCodigo: string | null;
  /** Cancelamento (não destrutivo): null = ortograma ativo. */
  cancelledAt: string | null;
  cancelReason: string | null;
}

export interface OrtogramaClientProps {
  patientId: string;
  chartId: string | null;
  marcasIniciais: Marca[];
  notesIniciais: string;
  /** Carimbo do registro carregado — devolvido na gravação (trava otimista). */
  updatedAt?: string;
  /** Data do ortograma de onde as marcas foram herdadas (null = não herdou). */
  herdadoDeData: string | null;
  historico: OrtogramaHistoricoItem[];
  cabecalho: {
    clinica: ClinicaImpressao;
    paciente: string;
    nascimento: string;
    prontuario: string;
    data: string;
    profissional: string;
    cro: string;
  };
}

/** Chave estável de uma marca (um dente não repete a mesma marcação). */
const chave = (m: Marca) => `${m.tooth}-${m.marking}`;

/** Assinatura do estado, para saber se há alterações não salvas. */
function assinatura(marcas: Marca[], notes: string): string {
  return [...marcas.map(chave)].sort().join("|") + "::" + notes.trim();
}

export function OrtogramaClient({
  patientId,
  chartId,
  marcasIniciais,
  notesIniciais,
  updatedAt,
  herdadoDeData,
  historico,
  cabecalho,
}: OrtogramaClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const reduzirMovimento = useReducedMotion();

  const [marcas, setMarcas] = useState<Marca[]>(marcasIniciais);
  const [notes, setNotes] = useState(notesIniciais);
  // Guardamos o chart criado no 1º save: sem isso, um segundo clique antes do
  // router.refresh() chegar com a prop atualizada criaria OUTRO ortograma.
  const [chartAtual, setChartAtual] = useState(chartId);
  // Carimbo da versão em edição. Atualizado a cada gravação: sem isso, o 2º
  // salvamento seguido bateria na trava otimista com o carimbo velho.
  const [carimbo, setCarimbo] = useState(updatedAt);
  const [ferramenta, setFerramenta] = useState<Ferramenta>(null);
  // Data da versão anterior reaberta para edição (null = editando o corrente).
  const [editandoDe, setEditandoDe] = useState<string | null>(null);
  // Última ação, lida por leitores de tela (região aria-live).
  const [anuncio, setAnuncio] = useState("");

  const inicial = useMemo(
    () => assinatura(marcasIniciais, notesIniciais),
    [marcasIniciais, notesIniciais],
  );
  const sujo = assinatura(marcas, notes) !== inicial;
  // Ortograma herdado do atendimento anterior: nada mudou ainda, mas ele ainda
  // NÃO existe como registro deste atendimento. Salvar é o que o materializa —
  // por isso o botão não pode depender de "sujo" aqui.
  const herdadoNaoSalvo = herdadoDeData !== null && chartAtual === null;
  const podeSalvar = sujo || herdadoNaoSalvo;

  const resumo = useMemo(() => calcularResumo(marcas), [marcas]);
  const observacoes = useMemo(() => observacoesAutomaticas(marcas), [marcas]);

  /**
   * Clique num dente. Sem ferramenta ativa não faz nada (o dentista precisa
   * escolher uma legenda antes) — avisamos em vez de aplicar algo por engano.
   * Com marcação: aplica ou REMOVE aquela marcação (toggle). Com borracha:
   * limpa o dente inteiro.
   */
  function clicarDente(tooth: number) {
    if (!ferramenta) {
      toast.info("Escolha uma legenda ao lado para marcar o dente.");
      return;
    }

    if (ferramenta === "borracha") {
      if (isHigido(marcas, tooth)) {
        setAnuncio(`Dente ${tooth} já estava hígido.`);
        return;
      }
      setMarcas((atual) => atual.filter((m) => m.tooth !== tooth));
      setAnuncio(`Dente ${tooth} limpo. Agora está hígido.`);
      return;
    }

    const jaTem = marcas.some(
      (m) => m.tooth === tooth && m.marking === ferramenta,
    );
    const rotulo = MARCACAO_LABELS[ferramenta];

    // A exclusividade de "Ausente" (aplicar Ausente zera o dente; qualquer outra
    // marcação expulsa a ausência) vive na função pura do contrato — a mesma que
    // o servidor usa para normalizar. Reimplementá-la aqui seria uma 2ª verdade.
    // Roda DENTRO do updater: em cliques rápidos, `marcas` do closure pode estar
    // defasado e duplicar a marcação.
    setMarcas((atual) => aplicarMarcacao(atual, tooth, ferramenta));
    setAnuncio(
      jaTem
        ? `${rotulo} removida do dente ${tooth}.`
        : `${rotulo} aplicada ao dente ${tooth}.`,
    );
  }

  function salvar() {
    startTransition(async () => {
      const res = await salvarOrtograma({
        patientId,
        chartId: chartAtual ?? undefined,
        // Trava otimista: só faz sentido ao regravar um chart existente.
        updatedAt: chartAtual ? carimbo : undefined,
        notes,
        // O banco devolve `note: null`; a action valida `note?: string`.
        marcas: marcas.map(({ tooth, marking, note }) => ({
          tooth,
          marking,
          note: note ?? undefined,
        })),
      });

      if (!res?.ok) {
        // Inclui o "foi alterado em outra sessão": nunca reenviamos forçando —
        // sobrescrever o trabalho da outra aba em silêncio é perda de dado clínico.
        toast.error(res?.error ?? "Não foi possível salvar o ortograma.");
        return;
      }
      if (res.chartId) setChartAtual(res.chartId);
      setCarimbo(res.updatedAt);
      setEditandoDe(null);
      toast.success("Ortograma salvo.");
      router.refresh();
    });
  }

  // Reabre uma versão anterior no editor para EDIÇÃO (sobrescreve aquele chart,
  // com trava otimista pelo carimbo). Diferente de "Visualizar" (só leitura).
  function editarVersao(item: OrtogramaHistoricoItem) {
    startTransition(async () => {
      const res = await carregarOrtograma(patientId, item.id);
      if (res.error || !res.versao) {
        toast.error(res.error ?? "Não foi possível abrir o ortograma para edição.");
        return;
      }
      setMarcas(res.versao.marcas);
      setNotes(res.versao.notes);
      setChartAtual(item.id);
      setCarimbo(res.versao.updatedAt);
      setEditandoDe(item.dataLabel);
      setFerramenta(null);
      toast.info(`Editando o ortograma de ${item.dataLabel}. Salvar sobrescreve essa versão.`);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex flex-col gap-4">
        {/* Herança entre atendimentos: o dentista parte do estado dentário
            conhecido, mas precisa saber que ainda não há registro desta consulta. */}
        {editandoDe ? (
          <p className="flex items-start gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <FileClock className="mt-0.5 h-4 w-4 flex-none text-amber-600" aria-hidden />
            <span>
              Editando o ortograma de <strong className="font-medium">{editandoDe}</strong> —
              salvar sobrescreve essa versão.
            </span>
          </p>
        ) : (
          herdadoNaoSalvo && (
            <p className="flex items-start gap-2 rounded-lg border border-dashed border-brand-200 bg-brand-50/50 px-3 py-2 text-sm text-muted">
              <FileClock className="mt-0.5 h-4 w-4 flex-none text-brand-600" aria-hidden />
              <span>
                Partindo do ortograma de <strong className="font-medium text-ink">{herdadoDeData}</strong> —
                salvar criará um novo registro para este atendimento.
              </span>
            </p>
          )
        )}

        {/* Arcos */}
        <Card className="p-4 sm:p-6">
          <FerramentaAtiva ferramenta={ferramenta} />

          <div className="mt-4 flex flex-col gap-8 overflow-x-auto pb-2">
            <Arco
              titulo="Arco superior"
              dentes={ARCO_SUPERIOR}
              marcas={marcas}
              ferramenta={ferramenta}
              onDente={clicarDente}
              animar={!reduzirMovimento}
            />
            <Arco
              titulo="Arco inferior"
              dentes={ARCO_INFERIOR}
              marcas={marcas}
              ferramenta={ferramenta}
              onDente={clicarDente}
              animar={!reduzirMovimento}
            />
          </div>

          {/* Ações do dentista são anunciadas sem roubar o foco do dente. */}
          <p aria-live="polite" className="sr-only">
            {anuncio}
          </p>
        </Card>

        {/* Observações: auto-geradas (derivadas) + texto livre (persistido) */}
        <Card className="p-4 sm:p-6">
          <h3 className="text-sm font-semibold text-ink">Observações</h3>

          <div className="mt-3 rounded-xl border border-line bg-muted-surface/40 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Geradas pelas marcações
            </p>
            {observacoes.length === 0 ? (
              <p className="text-sm text-muted">
                Nenhum dente marcado — arcada hígida.
              </p>
            ) : (
              <ul className="space-y-1 text-sm text-ink">
                {observacoes.map((linha) => (
                  <li key={linha}>{linha}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
              <Info className="mt-px h-3.5 w-3.5 flex-none" aria-hidden />
              Atualizadas automaticamente a cada marcação. Não são editáveis.
            </p>
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Observações do profissional
            </span>
            <textarea
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Achados do exame, condutas, orientações ao paciente…"
              className="w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <div className="mt-4 flex items-center justify-end gap-3">
            {sujo && (
              <span className="text-xs text-muted">Alterações não salvas</span>
            )}
            <Button onClick={salvar} disabled={pending || !podeSalvar}>
              <Save className="h-4 w-4" />
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </Card>
      </div>

      {/* Coluna direita: legenda + resumo + histórico */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        <Legenda ferramenta={ferramenta} onEscolher={setFerramenta} />
        <Resumo resumo={resumo} />
        <Historico
          patientId={patientId}
          itens={historico}
          chartAtual={chartAtual}
          cabecalho={cabecalho}
          onEditar={editarVersao}
        />
      </div>
    </div>
  );
}

// ── Histórico de ortogramas ──────────────────────────────────────

/**
 * Um ortograma por atendimento: as versões anteriores não se editam, só se
 * consultam. As marcas da versão são buscadas SOB DEMANDA (server action) —
 * carregar as marcas de todos os charts junto com a página seria N+1 de dado
 * clínico que quase nunca é aberto.
 */
function Historico({
  patientId,
  itens,
  chartAtual,
  cabecalho,
  onEditar,
}: {
  patientId: string;
  itens: OrtogramaHistoricoItem[];
  chartAtual: string | null;
  cabecalho: OrtogramaClientProps["cabecalho"];
  onEditar: (item: OrtogramaHistoricoItem) => void;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState<OrtogramaHistoricoItem | null>(null);
  const [versao, setVersao] = useState<OrtogramaVersao | null>(null);
  const [carregando, startCarregar] = useTransition();
  const [cancelar, setCancelar] = useState<OrtogramaHistoricoItem | null>(null);
  const [cancelando, startCancelar] = useTransition();

  // O ortograma em edição não é "anterior": ele já está na tela.
  const anteriores = itens.filter((i) => i.id !== chartAtual);

  function abrir(item: OrtogramaHistoricoItem) {
    setAberto(item);
    setVersao(null);
    startCarregar(async () => {
      const res = await carregarOrtograma(patientId, item.id);
      if (res.error || !res.versao) {
        toast.error(res.error ?? "Não foi possível abrir o ortograma.");
        setAberto(null);
        return;
      }
      setVersao(res.versao);
    });
  }

  // Impressão direta a partir da lista: carrega a versão e imprime.
  function imprimirItem(item: OrtogramaHistoricoItem) {
    startCarregar(async () => {
      const res = await carregarOrtograma(patientId, item.id);
      if (res.error || !res.versao) {
        toast.error(res.error ?? "Não foi possível abrir o ortograma.");
        return;
      }
      imprimirOrtograma(
        {
          ...cabecalho,
          data: item.dataLabel,
          profissional: res.versao.professionalName,
          atendimento: item.atendimentoCodigo ?? "—",
        },
        res.versao.marcas,
        res.versao.notes,
      );
    });
  }

  function confirmarCancelamento(motivo: string) {
    if (!cancelar) return;
    startCancelar(async () => {
      const res = await cancelarDocumento({
        tabela: "dental_charts",
        id: cancelar.id,
        motivo,
      });
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Ortograma cancelado.");
      setCancelar(null);
      router.refresh();
    });
  }

  const marcasVersao: Marca[] = versao?.marcas ?? [];

  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <History className="h-4 w-4 text-muted" aria-hidden />
        Ortogramas anteriores
      </h3>

      {anteriores.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhuma versão anterior registrada para este paciente.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {anteriores.map((item) => {
            const cancelado = item.cancelledAt !== null;
            return (
              <li
                key={item.id}
                className="rounded-lg border border-line px-2.5 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => !cancelado && abrir(item)}
                    disabled={cancelado}
                    className={cn(
                      "flex flex-1 flex-col items-start gap-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-default",
                      cancelado &&
                        "text-status-danger [&_*]:text-status-danger",
                    )}
                  >
                    <span className="text-sm font-medium text-ink">
                      {item.dataLabel}
                    </span>
                    <span className="text-xs font-medium text-brand-600">
                      Atendimento nº {item.atendimentoCodigo ?? "—"}
                    </span>
                    <span className="text-xs text-muted">
                      {item.professionalName} · {item.totalMarcas}{" "}
                      {item.totalMarcas === 1 ? "marcação" : "marcações"}
                    </span>
                  </button>
                  <DocumentActions
                    cancelled={cancelado}
                    cancelReason={item.cancelReason}
                    pending={carregando || cancelando}
                    onView={() => abrir(item)}
                    onEdit={() => onEditar(item)}
                    onPrint={() => imprimirItem(item)}
                    onCancel={() => setCancelar(item)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <CancelarDocumentoModal
        open={cancelar !== null}
        onClose={() => setCancelar(null)}
        onConfirm={confirmarCancelamento}
        pending={cancelando}
        titulo="Cancelar ortograma"
      />

      <Modal
        open={aberto !== null}
        onClose={() => setAberto(null)}
        title={`Ortograma de ${aberto?.dataLabel ?? ""}`}
        subtitle={
          aberto
            ? `${aberto.professionalName} · Atendimento nº ${aberto.atendimentoCodigo ?? "—"} · somente leitura`
            : undefined
        }
        className="max-w-4xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAberto(null)}>
              Fechar
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                versao &&
                imprimirOrtograma(
                  {
                    ...cabecalho,
                    data: aberto?.dataLabel ?? cabecalho.data,
                    profissional: versao.professionalName,
                    atendimento: aberto?.atendimentoCodigo ?? "—",
                  },
                  marcasVersao,
                  versao.notes,
                )
              }
              disabled={!versao}
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
          </>
        }
      >
        {carregando || !versao ? (
          <p className="py-8 text-center text-sm text-muted">Carregando…</p>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-8 overflow-x-auto pb-2">
              <Arco
                titulo="Arco superior"
                dentes={ARCO_SUPERIOR}
                marcas={marcasVersao}
                ferramenta={null}
                onDente={() => {}}
                animar={false}
                leitura
              />
              <Arco
                titulo="Arco inferior"
                dentes={ARCO_INFERIOR}
                marcas={marcasVersao}
                ferramenta={null}
                onDente={() => {}}
                animar={false}
                leitura
              />
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Observações
              </h4>
              {observacoesAutomaticas(marcasVersao).length === 0 ? (
                <p className="text-sm text-muted">
                  Nenhum dente marcado — arcada hígida.
                </p>
              ) : (
                <ul className="space-y-1 text-sm text-ink">
                  {observacoesAutomaticas(marcasVersao).map((linha) => (
                    <li key={linha}>{linha}</li>
                  ))}
                </ul>
              )}
              {versao.notes.trim() && (
                <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-sm text-ink">
                  {versao.notes}
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

// ── Faixa da ferramenta ativa ────────────────────────────────────

function FerramentaAtiva({ ferramenta }: { ferramenta: Ferramenta }) {
  if (!ferramenta) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dashed border-line bg-muted-surface/40 px-3 py-2 text-sm text-muted">
        <Info className="h-4 w-4 flex-none" aria-hidden />
        Escolha uma legenda para começar a marcar. Clicar de novo no mesmo dente
        remove a marcação.
      </p>
    );
  }

  const borracha = ferramenta === "borracha";
  const cor = borracha ? COR_HIGIDO : MARCACAO_CORES[ferramenta];
  const rotulo = borracha ? "Limpar dente" : MARCACAO_LABELS[ferramenta];

  return (
    <p
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-ink",
        borracha && "bg-muted-surface/60",
      )}
      // Fundo tingido com a cor da marcação (alpha em hex). A borracha usa um
      // token de superfície: seu "cor" é uma var() e não aceita sufixo de alpha.
      style={{
        borderColor: cor,
        backgroundColor: borracha ? undefined : `${cor}14`,
      }}
    >
      <span
        className="h-3 w-3 flex-none rounded-full"
        style={{ backgroundColor: cor }}
        aria-hidden
      />
      Ferramenta ativa: {rotulo}
    </p>
  );
}

// ── Arco ─────────────────────────────────────────────────────────

function Arco({
  titulo,
  dentes,
  marcas,
  ferramenta,
  onDente,
  animar,
  leitura = false,
}: {
  titulo: string;
  dentes: number[];
  marcas: Marca[];
  ferramenta: Ferramenta;
  onDente: (tooth: number) => void;
  animar: boolean;
  /** Versão do histórico: dentes viram só leitura (nada de clique). */
  leitura?: boolean;
}) {
  return (
    <section aria-label={titulo}>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          {titulo}
        </h3>
      </div>

      {/* Lados nomeados do ponto de vista do PACIENTE, como no exame. */}
      <div className="flex min-w-[1060px] items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
        <span className="flex-1 text-center">Lado direito</span>
        <span className="w-px" aria-hidden />
        <span className="flex-1 text-center">Lado esquerdo</span>
      </div>

      <div
        role="group"
        aria-label={titulo}
        className="flex min-w-[1060px] items-start justify-center gap-1"
      >
        {dentes.map((tooth, i) => (
          <div key={tooth} className="flex items-start">
            <Dente
              tooth={tooth}
              marcacoes={marcasDoDente(marcas, tooth)}
              ausente={isAusente(marcas, tooth)}
              ferramenta={ferramenta}
              onClick={() => onDente(tooth)}
              animar={animar}
              leitura={leitura}
            />
            {/* Linha média, entre os índices 7 e 8. */}
            {i === ULTIMO_DIREITA && (
              <span
                className="mx-2 h-36 w-px flex-none self-center bg-line"
                aria-hidden
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Dente ────────────────────────────────────────────────────────

function Dente({
  tooth,
  marcacoes,
  ausente,
  ferramenta,
  onClick,
  animar,
  leitura = false,
}: {
  tooth: number;
  marcacoes: Marcacao[];
  ausente: boolean;
  ferramenta: Ferramenta;
  onClick: () => void;
  animar: boolean;
  leitura?: boolean;
}) {
  const higido = marcacoes.length === 0;
  // O contorno assume a cor da 1ª marcação (ordem canônica de MARCACOES); as
  // demais aparecem como pontos empilhados sob o dente. Assim um dente com
  // "canal + coroa" mostra as duas cores sem virar um borrão.
  const cor = higido ? COR_HIGIDO : MARCACAO_CORES[marcacoes[0]];
  const rotulos = marcacoes.map((m) => MARCACAO_LABELS[m]);
  // "Dente 24 — ausente" / "Dente 12 — Cárie, Coroa" / "Dente 31 — hígido".
  const descricao = ausente
    ? "ausente"
    : higido
      ? "hígido"
      : rotulos.join(", ");

  const inferior = tooth >= 30;

  const numero = (
    <span className="text-[11px] font-semibold tabular-nums text-muted">
      {tooth}
    </span>
  );

  // A marcação ALTERA o desenho do dente (X da extração, ponto da cárie,
  // parafuso do implante…), como no ortograma impresso — não é um ícone ao
  // lado. Cada marcação sabe em qual vista aparece; ver `marcacao-desenho.ts`.
  const marcacoesDesenho = marcacoes.filter((m) => m !== "ausente");

  const oclusal = (
    <motion.span
      key={marcacoesDesenho.join("-") || "higido"}
      initial={animar ? { scale: 0.94, opacity: 0.6 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-12 w-12 flex-none items-center justify-center"
    >
      <DenteOclusalSvg
        tooth={tooth}
        stroke={cor}
        fill={higido ? "none" : `${cor}14`}
        ausente={ausente}
        marcacoes={marcacoesDesenho}
        className="h-12 w-12"
      />
    </motion.span>
  );

  // Vista vestibular: coroa + raízes, espelhada conforme arco e lado.
  const vestibular = (
    <DenteSvg
      tooth={tooth}
      stroke={cor}
      fill={higido ? "none" : `${cor}1f`}
      ausente={ausente}
      marcacoes={marcacoesDesenho}
      className="h-[72px] w-[42px] flex-none"
    />
  );

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={leitura}
      aria-pressed={!higido}
      aria-label={`Dente ${tooth} — ${descricao}`}
      title={`Dente ${tooth} — ${descricao}`}
      className={cn(
        "flex w-[60px] flex-col items-center gap-1 rounded-lg p-1 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
        leitura ? "cursor-default disabled:opacity-100" : "hover:bg-brand-50",
        !leitura && ferramenta ? "cursor-pointer" : "cursor-default",
      )}
    >
      {/* Arco superior: número, face oclusal, coroa+raiz. No inferior a ordem se
          inverte — as raízes apontam para cima e o número fica embaixo, como na
          boca e como no ortograma impresso. */}
      {inferior ? (
        <>
          {vestibular}
          {oclusal}
          {numero}
        </>
      ) : (
        <>
          {numero}
          {oclusal}
          {vestibular}
        </>
      )}
    </button>
  );
}

// ── Legenda ──────────────────────────────────────────────────────

function Legenda({
  ferramenta,
  onEscolher,
}: {
  ferramenta: Ferramenta;
  onEscolher: (f: Ferramenta) => void;
}) {
  /** Clicar na ferramenta já ativa a desliga (volta ao modo "só leitura"). */
  const alternar = (f: Exclude<Ferramenta, null>) =>
    onEscolher(ferramenta === f ? null : f);

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">Legenda</h3>

      <ul className="flex flex-col gap-1">
        {MARCACOES.map((m) => {
          const ativo = ferramenta === m;
          const cor = MARCACAO_CORES[m];
          return (
            <li key={m}>
              <button
                type="button"
                onClick={() => alternar(m)}
                aria-pressed={ativo}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-sm transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                  ativo
                    ? "border-transparent font-semibold text-ink ring-2"
                    : "border-line text-muted hover:border-brand-200 hover:bg-brand-50/40 hover:text-ink",
                )}
                style={
                  ativo
                    ? { backgroundColor: `${cor}14`, boxShadow: `0 0 0 2px ${cor}` }
                    : undefined
                }
              >
                {/* Mesmo símbolo que aparece sobre o dente — é o que liga a
                    legenda ao desenho sem depender da cor. */}
                <span
                  className="flex h-4 w-4 flex-none items-center justify-center text-[11px] font-bold leading-none"
                  style={{ color: cor }}
                  aria-hidden
                >
                  {MARCACAO_SIMBOLOS[m]}
                </span>
                {MARCACAO_LABELS[m]}
              </button>
            </li>
          );
        })}

        {/* Hígido não é ferramenta: é a ausência de marcações. Só informa. */}
        <li className="mt-1 flex items-center gap-2.5 rounded-lg border border-dashed border-line px-2.5 py-2 text-sm text-muted">
          <span
            className="h-3.5 w-3.5 flex-none rounded-full border"
            style={{ borderColor: COR_HIGIDO }}
            aria-hidden
          />
          Hígido (sem marcação)
        </li>
      </ul>

      <div className="mt-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => alternar("borracha")}
          aria-pressed={ferramenta === "borracha"}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-sm transition-all",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
            ferramenta === "borracha"
              ? "border-brand-500 bg-brand-50 font-semibold text-brand-700"
              : "border-line text-muted hover:border-brand-200 hover:bg-brand-50/40 hover:text-ink",
          )}
        >
          <Eraser className="h-3.5 w-3.5 flex-none" aria-hidden />
          Limpar dente
        </button>
        <p className="mt-1.5 text-xs text-muted">
          Remove todas as marcações do dente clicado.
        </p>
      </div>
    </Card>
  );
}

// ── Resumo ───────────────────────────────────────────────────────

function Resumo({ resumo }: { resumo: ReturnType<typeof calcularResumo> }) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-ink">Resumo</h3>

      <dl className="mt-3 flex flex-col gap-1.5 text-sm">
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted-surface/60 px-2.5 py-1.5">
          <dt className="flex items-center gap-2 text-muted">
            <span
              className="h-3 w-3 flex-none rounded-full border"
              style={{ borderColor: COR_HIGIDO }}
              aria-hidden
            />
            Dentes hígidos
          </dt>
          <dd className="font-semibold tabular-nums text-ink">
            {resumo.higidos}
            <span className="ml-0.5 text-xs font-normal text-muted">
              /{TODOS_OS_DENTES.length}
            </span>
          </dd>
        </div>

        {MARCACOES.map((m) => (
          <div
            key={m}
            className="flex items-center justify-between gap-2 px-2.5 py-1"
          >
            <dt className="flex items-center gap-2 text-muted">
              <span
                className="flex h-3.5 w-3.5 flex-none items-center justify-center text-[10px] font-bold leading-none"
                style={{ color: MARCACAO_CORES[m] }}
                aria-hidden
              >
                {MARCACAO_SIMBOLOS[m]}
              </span>
              {MARCACAO_LABELS[m]}
            </dt>
            <dd
              className={cn(
                "font-semibold tabular-nums",
                resumo[m] > 0 ? "text-ink" : "text-muted",
              )}
            >
              {resumo[m]}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-xs text-muted">
        Hígidos contam dentes; as demais contam ocorrências (um dente pode ter
        mais de uma marcação).
      </p>
    </Card>
  );
}
