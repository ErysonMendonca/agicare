"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  FlaskConical,
  Microscope,
  Scan,
  CheckCircle2,
  RotateCcw,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { cn } from "@/lib/utils";
import { DocumentActions } from "@/components/clinico/DocumentActions";
import { CancelarDocumentoModal } from "@/components/clinico/CancelarDocumentoModal";
import {
  EXAMES_TUSS,
  LATERALIDADES,
  type ExamCategoria,
  type ExamOrder,
} from "@/lib/clinico/exames-shared";
import {
  criarPedidosExames,
  atualizarStatusExame,
  editarExame,
  enviarResultadoExameEmail,
} from "@/lib/actions/exames";
import { cancelarDocumento } from "@/lib/actions/documento-cancelamento";
import {
  abrirImpressao,
  camposIdentPadrao,
  esc,
  hojeBR,
  identPacienteHTML,
  limpo,
  montarDocumentoBase,
  rodapeAssinaturaProfissional,
  type ClinicaImpressao,
} from "@/lib/clinico/documento-impressao";

type PacienteIdent = {
  nome: string;
  registro: string;
  idade: string;
  convenio: string;
  plano: string;
  dataAdmissao: string;
  nascimento: string;
  sexo: string;
  nomeMae: string;
};

const CATEGORIA_LABEL: Record<ExamCategoria, string> = {
  laboratorial: "Laboratorial",
  imagem: "Imagem",
};

function CategoriaTag({ categoria }: { categoria: ExamCategoria }) {
  const Icon = categoria === "imagem" ? Scan : Microscope;
  return (
    <Badge status={categoria === "imagem" ? "wait" : "active"}>
      <Icon className="h-3 w-3" /> {CATEGORIA_LABEL[categoria]}
    </Badge>
  );
}

/** Impressão do pedido de exame no modelo padrão (documento-impressao). */
function imprimirExame(
  clinica: ClinicaImpressao,
  paciente: PacienteIdent,
  e: ExamOrder,
  profissional: { nome: string; conselho: string },
) {
  const ident = identPacienteHTML(paciente.nome, [
    ...camposIdentPadrao({
      registro: limpo(paciente.registro) || "—",
      atendimento: e.atendimentoCodigo,
      convenio: limpo(paciente.convenio) || "—",
      plano: limpo(paciente.plano) || "—",
      dataAdmissao: limpo(paciente.dataAdmissao) || "—",
      nascimento: limpo(paciente.nascimento) || "—",
      idade: limpo(paciente.idade) || "—",
      sexo: limpo(paciente.sexo) || "—",
      nomeMae: limpo(paciente.nomeMae) || "—",
    }),
    { lbl: "Solicitado em", val: limpo(e.quando) || "—" },
  ]);

  // Tabela: Código TUSS / Exame / Lateralidade / Observação. Lateralidade e
  // Observação (quando informadas) saem impressas aqui, conforme pedido do cliente.
  const linhaObs = limpo(e.observacoes ?? "");
  const linhaLat = limpo(e.lateralidade ?? "");
  const corpo = `
    <div class="corpo-lbl">Exame solicitado:</div>
    <table class="tab">
      <tr><th style="width:100px">Código TUSS</th><th>Exame</th><th style="width:90px">Lateralidade</th><th style="width:150px">Observação</th></tr>
      <tr>
        <td>${esc(limpo(e.tuss ?? "") || "—")}</td>
        <td>${esc(e.exame)}</td>
        <td>${esc(linhaLat || "—")}</td>
        <td>${esc(linhaObs || "—")}</td>
      </tr>
    </table>
    <div class="meta">
      <span><b>Categoria:</b> ${esc(CATEGORIA_LABEL[e.categoria])}</span>
      <span><b>Status:</b> ${e.status === "concluido" ? "Concluído" : "Solicitado"}</span>
    </div>`;

  const html = montarDocumentoBase({
    titulo: "PEDIDO DE EXAMES",
    clinica,
    pacienteNome: paciente.nome,
    identHTML: ident,
    corpoHTML: corpo,
    rodapeHTML: rodapeAssinaturaProfissional(
      limpo(profissional.nome) || "Profissional responsável",
      limpo(profissional.conselho) ? `Assinatura e carimbo — ${profissional.conselho}` : "Assinatura e carimbo",
    ),
    cssExtra: `
      .corpo { min-height: 260px; }
      .corpo .tab { width: 100%; border-collapse: collapse; margin: 4px 0 10px; }
      .corpo .tab th, .corpo .tab td { border: 1px solid #aaa; padding: 5px 8px; font-size: 12px; text-align: left; }
      .corpo .tab th { background: #f0f0f0; }
      .corpo .meta { font-size: 12px; display: flex; gap: 24px; }`,
  });

  abrirImpressao(html, "Permita pop-ups para imprimir o pedido de exame.");
}

/** Item do lote recém-solicitado (fluxo "Solicitação de Exames"), antes de virar ExamOrder. */
type ItemLote = {
  tuss: string;
  nome: string;
  obs: string;
  lateralidade: string;
};

/**
 * Imprime o relatório DESMEMBRADO por categoria: um documento único listando
 * TODOS os exames do lote recém-salvo (todos da mesma categoria, pois o
 * fluxo escolhe a categoria antes de listar os exames) — nunca mistura
 * Imagem e Laboratorial no mesmo relatório, conforme pedido do cliente.
 */
function imprimirRelatorioLote(
  clinica: ClinicaImpressao,
  paciente: PacienteIdent,
  categoria: ExamCategoria,
  itens: ItemLote[],
  profissional: { nome: string; conselho: string },
) {
  const ident = identPacienteHTML(paciente.nome, [
    ...camposIdentPadrao({
      registro: limpo(paciente.registro) || "—",
      atendimento: null,
      convenio: limpo(paciente.convenio) || "—",
      plano: limpo(paciente.plano) || "—",
      dataAdmissao: limpo(paciente.dataAdmissao) || "—",
      nascimento: limpo(paciente.nascimento) || "—",
      idade: limpo(paciente.idade) || "—",
      sexo: limpo(paciente.sexo) || "—",
      nomeMae: limpo(paciente.nomeMae) || "—",
    }),
    { lbl: "Solicitado em", val: hojeBR() },
  ]);

  const mostraLateralidade = categoria === "imagem";
  const linhas = itens
    .map(
      (it) => `
      <tr>
        <td>${esc(it.tuss || "—")}</td>
        <td>${esc(it.nome)}</td>
        ${mostraLateralidade ? `<td>${esc(limpo(it.lateralidade) || "—")}</td>` : ""}
        <td>${esc(limpo(it.obs) || "—")}</td>
      </tr>`,
    )
    .join("");

  const corpo = `
    <div class="corpo-lbl">Exames solicitados (${CATEGORIA_LABEL[categoria]}):</div>
    <table class="tab">
      <tr>
        <th style="width:100px">Código TUSS</th>
        <th>Exame</th>
        ${mostraLateralidade ? `<th style="width:90px">Lateralidade</th>` : ""}
        <th style="width:180px">Observação</th>
      </tr>
      ${linhas}
    </table>`;

  const html = montarDocumentoBase({
    titulo: `SOLICITAÇÃO DE EXAMES — ${CATEGORIA_LABEL[categoria].toUpperCase()}`,
    clinica,
    pacienteNome: paciente.nome,
    identHTML: ident,
    corpoHTML: corpo,
    rodapeHTML: rodapeAssinaturaProfissional(
      limpo(profissional.nome) || "Profissional responsável",
      limpo(profissional.conselho) ? `Assinatura e carimbo — ${profissional.conselho}` : "Assinatura e carimbo",
    ),
    cssExtra: `
      .corpo { min-height: 260px; }
      .corpo .tab { width: 100%; border-collapse: collapse; margin: 4px 0 10px; }
      .corpo .tab th, .corpo .tab td { border: 1px solid #aaa; padding: 5px 8px; font-size: 12px; text-align: left; }
      .corpo .tab th { background: #f0f0f0; }
      .corpo .meta { font-size: 12px; display: flex; gap: 24px; }`,
  });

  abrirImpressao(html, "Permita pop-ups para imprimir o relatório de exames.");
}

export function ExamesClient({
  patientId,
  clinica,
  paciente,
  exames,
  profissional,
}: {
  patientId: string;
  clinica: ClinicaImpressao;
  paciente: PacienteIdent;
  exames: ExamOrder[];
  profissional: { nome: string; conselho: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [updating, setUpdating] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);

  // Modais de ações por item
  const [viewing, setViewing] = useState<ExamOrder | null>(null);
  const [editing, setEditing] = useState<ExamOrder | null>(null);
  const [cancelando, setCancelando] = useState<ExamOrder | null>(null);

  // ── Wizard "Solicitação de Exames": categoria → seleção múltipla → detalhes ──
  type WizardStep = "categoria" | "selecao" | "detalhes";
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("categoria");
  const [categoria, setCategoria] = useState<ExamCategoria | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [detalhes, setDetalhes] = useState<
    Record<string, { obs: string; lateralidade: string }>
  >({});

  // Estado do modal de edição
  const [editExame, setEditExame] = useState("");
  const [editTuss, setEditTuss] = useState("");
  const [editCategoria, setEditCategoria] =
    useState<ExamCategoria>("laboratorial");
  const [editObs, setEditObs] = useState("");
  const [editLat, setEditLat] = useState<string>(LATERALIDADES[0]);

  const examesDaCategoria = useMemo(
    () =>
      categoria ? EXAMES_TUSS.filter((e) => e.categoria === categoria) : [],
    [categoria],
  );

  function abrirWizard() {
    setStep("categoria");
    setCategoria(null);
    setSelecionados([]);
    setDetalhes({});
    setWizardOpen(true);
  }

  function escolherCategoria(cat: ExamCategoria) {
    setCategoria(cat);
    setSelecionados([]);
    setStep("selecao");
  }

  function alternarSelecao(tussCode: string) {
    setSelecionados((prev) =>
      prev.includes(tussCode)
        ? prev.filter((t) => t !== tussCode)
        : [...prev, tussCode],
    );
  }

  function avancarParaDetalhes() {
    if (selecionados.length === 0) {
      toast.error("Selecione ao menos um exame.");
      return;
    }
    setDetalhes((prev) => {
      const novo = { ...prev };
      for (const tussCode of selecionados) {
        if (!novo[tussCode]) {
          novo[tussCode] = { obs: "", lateralidade: LATERALIDADES[0] };
        }
      }
      return novo;
    });
    setStep("detalhes");
  }

  function atualizarDetalhe(
    tussCode: string,
    campo: "obs" | "lateralidade",
    valor: string,
  ) {
    setDetalhes((prev) => ({
      ...prev,
      [tussCode]: { ...(prev[tussCode] ?? { obs: "", lateralidade: LATERALIDADES[0] }), [campo]: valor },
    }));
  }

  function salvarLote() {
    if (!categoria || selecionados.length === 0) return;
    const itensParaSalvar = selecionados.map((tussCode) => {
      const exame = EXAMES_TUSS.find((e) => e.tuss === tussCode);
      const det = detalhes[tussCode] ?? { obs: "", lateralidade: LATERALIDADES[0] };
      return {
        tuss_code: tussCode,
        exam_name: exame?.nome ?? "—",
        notes: det.obs.trim() || undefined,
        laterality: categoria === "imagem" ? det.lateralidade : undefined,
      };
    });
    startTransition(async () => {
      const res = await criarPedidosExames({
        patientId,
        category: categoria,
        itens: itensParaSalvar,
      });
      if (res?.ok) {
        toast.success(
          itensParaSalvar.length === 1
            ? "Exame solicitado."
            : `${itensParaSalvar.length} exames solicitados.`,
        );
        imprimirRelatorioLote(
          clinica,
          paciente,
          categoria,
          itensParaSalvar.map((it) => ({
            tuss: it.tuss_code,
            nome: it.exam_name,
            obs: it.notes ?? "",
            lateralidade: it.laterality ?? "",
          })),
          profissional,
        );
        setWizardOpen(false);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível solicitar os exames.");
      }
    });
  }

  function abrirEdicao(e: ExamOrder) {
    setEditExame(e.exame);
    setEditTuss(e.tuss ?? "");
    setEditCategoria(e.categoria);
    setEditObs(e.observacoes ?? "");
    setEditLat(e.lateralidade ?? LATERALIDADES[0]);
    setEditing(e);
  }

  function salvarEdicao() {
    if (!editing) return;
    if (!editExame.trim()) {
      toast.error("Informe o exame.");
      return;
    }
    startTransition(async () => {
      const res = await editarExame({
        id: editing.id,
        patientId,
        exam_name: editExame.trim(),
        tuss_code: editTuss.trim() || undefined,
        category: editCategoria,
        notes: editObs.trim() || undefined,
        laterality: editLat,
      });
      if (res?.ok) {
        toast.success("Exame atualizado.");
        setEditing(null);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível atualizar o exame.");
      }
    });
  }

  function confirmarCancelamento(motivo: string) {
    if (!cancelando) return;
    startTransition(async () => {
      const res = await cancelarDocumento({
        tabela: "exam_orders",
        id: cancelando.id,
        motivo,
      });
      if (res?.ok) {
        toast.success("Exame cancelado.");
        setCancelando(null);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível cancelar o exame.");
      }
    });
  }

  function enviarResultado(e: ExamOrder) {
    setEnviando(e.id);
    startTransition(async () => {
      const res = await enviarResultadoExameEmail({
        examId: e.id,
        patientId,
      });
      setEnviando(null);
      if (res?.ok) {
        toast.success("Resultado enviado por e-mail ao paciente.");
      } else {
        toast.error(res?.error ?? "Não foi possível enviar o resultado.");
      }
    });
  }

  function alternarStatus(e: ExamOrder) {
    const proximo = e.status === "solicitado" ? "concluido" : "solicitado";
    setUpdating(e.id);
    startTransition(async () => {
      const res = await atualizarStatusExame(e.id, proximo, patientId);
      setUpdating(null);
      if (res?.ok) {
        toast.success(
          proximo === "concluido"
            ? "Exame marcado como concluído."
            : "Exame reaberto.",
        );
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível atualizar o status.");
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={abrirWizard}>
          <Plus className="h-4 w-4" /> Solicitação de Exames
        </Button>
      </div>

      {exames.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-5 py-16 text-center">
          <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted-surface text-muted">
            <FlaskConical className="h-7 w-7" />
          </span>
          <p className="font-medium text-ink">Nenhum exame solicitado</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            Solicite o primeiro exame laboratorial ou de imagem deste atendimento.
          </p>
        </Card>
      ) : (
        <Stagger className="flex flex-col gap-3">
          {exames.map((e) => {
            const cancelado = e.cancelledAt != null;
            return (
              <FadeInUp key={e.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                        <FlaskConical className="h-5 w-5" />
                      </span>
                      <div
                        className={cn(
                          cancelado &&
                            "text-status-danger [&_*]:text-status-danger",
                        )}
                      >
                        <p className="font-medium text-ink">{e.exame}</p>
                        <p className="text-xs text-muted">
                          {e.profissional} · {e.quando}
                        </p>
                        <p className="mt-0.5 text-xs font-medium text-brand-600">
                          Atendimento nº {e.atendimentoCodigo ?? "—"}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <CategoriaTag categoria={e.categoria} />
                          <Badge
                            status={e.status === "concluido" ? "ok" : "warn"}
                          >
                            {e.status === "concluido"
                              ? "Concluído"
                              : "Solicitado"}
                          </Badge>
                          {e.tuss && (
                            <span className="text-xs text-muted">
                              TUSS {e.tuss}
                            </span>
                          )}
                          {e.lateralidade && (
                            <Badge status="active">{e.lateralidade}</Badge>
                          )}
                        </div>
                        {e.observacoes && (
                          <p className="mt-1.5 text-sm text-muted">
                            {e.observacoes}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-none flex-wrap items-center gap-2">
                      {!cancelado && e.status === "concluido" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending && enviando === e.id}
                          onClick={() => enviarResultado(e)}
                        >
                          <Mail className="h-4 w-4" />
                          {pending && enviando === e.id
                            ? "Enviando…"
                            : "Enviar resultado por e-mail"}
                        </Button>
                      )}
                      {!cancelado && (
                        <Button
                          size="sm"
                          variant={
                            e.status === "concluido" ? "ghost" : "outline"
                          }
                          disabled={pending && updating === e.id}
                          onClick={() => alternarStatus(e)}
                        >
                          {e.status === "concluido" ? (
                            <>
                              <RotateCcw className="h-4 w-4" /> Reabrir
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4" /> Marcar
                              concluído
                            </>
                          )}
                        </Button>
                      )}
                      <DocumentActions
                        cancelled={cancelado}
                        cancelReason={e.cancelReason}
                        pending={pending}
                        onView={() => setViewing(e)}
                        onEdit={() => abrirEdicao(e)}
                        onPrint={() => imprimirExame(clinica, paciente, e, profissional)}
                        onCancel={() => setCancelando(e)}
                      />
                    </div>
                  </div>
                </Card>
              </FadeInUp>
            );
          })}
        </Stagger>
      )}

      {/* Wizard "Solicitação de Exames": categoria → seleção múltipla → detalhes */}
      <Modal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title="Solicitação de Exames"
        subtitle={
          step === "categoria"
            ? "Escolha a categoria do exame."
            : step === "selecao"
              ? `Selecione os exames ${categoria === "imagem" ? "de imagem" : "laboratoriais"} desejados.`
              : "Informe os detalhes de cada exame selecionado."
        }
        className="max-w-xl"
        footer={
          step === "categoria" ? (
            <Button variant="outline" onClick={() => setWizardOpen(false)}>
              Cancelar
            </Button>
          ) : step === "selecao" ? (
            <>
              <Button variant="outline" onClick={() => setStep("categoria")}>
                Voltar
              </Button>
              <Button onClick={avancarParaDetalhes}>Continuar</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("selecao")}>
                Voltar
              </Button>
              <Button onClick={salvarLote} disabled={pending}>
                {pending ? "Salvando…" : "Salvar e Imprimir"}
              </Button>
            </>
          )
        }
      >
        {step === "categoria" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => escolherCategoria("imagem")}
              className="flex flex-col items-center gap-2 rounded-xl border border-line p-6 text-center transition-colors hover:border-brand-300 hover:bg-brand-50"
            >
              <Scan className="h-8 w-8 text-brand-600" />
              <span className="font-medium text-ink">Exames de Imagens</span>
            </button>
            <button
              type="button"
              onClick={() => escolherCategoria("laboratorial")}
              className="flex flex-col items-center gap-2 rounded-xl border border-line p-6 text-center transition-colors hover:border-brand-300 hover:bg-brand-50"
            >
              <Microscope className="h-8 w-8 text-brand-600" />
              <span className="font-medium text-ink">Exames Laboratoriais</span>
            </button>
          </div>
        )}

        {step === "selecao" && categoria && (
          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {examesDaCategoria.map((e) => (
              <label
                key={e.tuss}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-3 text-sm hover:bg-muted-surface"
              >
                <input
                  type="checkbox"
                  checked={selecionados.includes(e.tuss)}
                  onChange={() => alternarSelecao(e.tuss)}
                  className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-400"
                />
                <span>
                  <span className="font-medium text-ink">{e.nome}</span>
                  <span className="ml-2 text-xs text-muted">
                    TUSS {e.tuss}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        {step === "detalhes" && categoria && (
          <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto">
            {selecionados.map((tussCode) => {
              const exame = EXAMES_TUSS.find((e) => e.tuss === tussCode);
              const det = detalhes[tussCode] ?? {
                obs: "",
                lateralidade: LATERALIDADES[0],
              };
              return (
                <div key={tussCode} className="rounded-lg border border-line p-3">
                  <p className="mb-2 text-sm font-medium text-ink">
                    {exame?.nome}
                  </p>
                  {categoria === "imagem" && (
                    <Select
                      label="Lateralidade"
                      value={det.lateralidade}
                      onChange={(ev) =>
                        atualizarDetalhe(tussCode, "lateralidade", ev.target.value)
                      }
                    >
                      {LATERALIDADES.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  )}
                  <label className="mt-3 block">
                    <span className="mb-1.5 block text-sm font-medium text-ink">
                      Observações
                    </span>
                    <textarea
                      rows={2}
                      placeholder="Ex.: jejum de 8h, preparo, hipótese diagnóstica..."
                      value={det.obs}
                      onChange={(ev) =>
                        atualizarDetalhe(tussCode, "obs", ev.target.value)
                      }
                      className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* Modal Visualizar (read-only) */}
      <Modal
        open={viewing != null}
        onClose={() => setViewing(null)}
        title="Detalhes do exame"
        className="max-w-xl"
        footer={
          <Button variant="outline" onClick={() => setViewing(null)}>
            Fechar
          </Button>
        }
      >
        {viewing && (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="font-medium text-ink">Exame</dt>
              <dd className="text-muted">{viewing.exame}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Categoria</dt>
              <dd className="mt-1">
                <CategoriaTag categoria={viewing.categoria} />
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Status</dt>
              <dd className="text-muted">
                {viewing.status === "concluido" ? "Concluído" : "Solicitado"}
              </dd>
            </div>
            {viewing.tuss && (
              <div>
                <dt className="font-medium text-ink">Código TUSS</dt>
                <dd className="text-muted">{viewing.tuss}</dd>
              </div>
            )}
            <div>
              <dt className="font-medium text-ink">Solicitado em</dt>
              <dd className="text-muted">{viewing.quando}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Lateralidade</dt>
              <dd className="text-muted">{viewing.lateralidade ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-medium text-ink">Observações</dt>
              <dd className="text-muted">{viewing.observacoes ?? "—"}</dd>
            </div>
          </dl>
        )}
      </Modal>

      {/* Modal Editar */}
      <Modal
        open={editing != null}
        onClose={() => setEditing(null)}
        title="Editar exame"
        className="max-w-xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarEdicao} disabled={pending}>
              {pending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Exame
            </span>
            <input
              value={editExame}
              onChange={(ev) => setEditExame(ev.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Código TUSS
              </span>
              <input
                value={editTuss}
                onChange={(ev) => setEditTuss(ev.target.value)}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <Select
              label="Categoria"
              value={editCategoria}
              onChange={(ev) =>
                setEditCategoria(ev.target.value as ExamCategoria)
              }
            >
              <option value="laboratorial">Laboratorial</option>
              <option value="imagem">Imagem</option>
            </Select>
          </div>
          <Select
            label="Lateralidade"
            value={editLat}
            onChange={(ev) => setEditLat(ev.target.value)}
          >
            {LATERALIDADES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Observações
            </span>
            <textarea
              rows={3}
              value={editObs}
              onChange={(ev) => setEditObs(ev.target.value)}
              className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </div>
      </Modal>

      {/* Modal Cancelar */}
      <CancelarDocumentoModal
        open={cancelando != null}
        onClose={() => setCancelando(null)}
        onConfirm={confirmarCancelamento}
        pending={pending}
        titulo="Cancelar exame"
      />
    </>
  );
}
