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
  criarPedidoExame,
  atualizarStatusExame,
  editarExame,
  enviarResultadoExameEmail,
} from "@/lib/actions/exames";
import { cancelarDocumento } from "@/lib/actions/documento-cancelamento";
import {
  abrirImpressao,
  esc,
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
) {
  const ident = identPacienteHTML(paciente.nome, [
    { lbl: "Registro", val: limpo(paciente.registro) || "—" },
    { lbl: "Idade", val: limpo(paciente.idade) || "—" },
    { lbl: "Convênio", val: limpo(paciente.convenio) || "—" },
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
      "Profissional responsável",
      "Assinatura e carimbo (CRM)",
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

export function ExamesClient({
  patientId,
  clinica,
  paciente,
  exames,
}: {
  patientId: string;
  clinica: ClinicaImpressao;
  paciente: PacienteIdent;
  exames: ExamOrder[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [updating, setUpdating] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [form, setForm] = useState(false);

  // Modais de ações por item
  const [viewing, setViewing] = useState<ExamOrder | null>(null);
  const [editing, setEditing] = useState<ExamOrder | null>(null);
  const [cancelando, setCancelando] = useState<ExamOrder | null>(null);

  const [tuss, setTuss] = useState(EXAMES_TUSS[0]?.tuss ?? "");
  const [observacoes, setObservacoes] = useState("");
  const [lateralidade, setLateralidade] = useState<string>(LATERALIDADES[0]);

  // Estado do modal de edição
  const [editExame, setEditExame] = useState("");
  const [editTuss, setEditTuss] = useState("");
  const [editCategoria, setEditCategoria] =
    useState<ExamCategoria>("laboratorial");
  const [editObs, setEditObs] = useState("");
  const [editLat, setEditLat] = useState<string>(LATERALIDADES[0]);

  const selecionado = useMemo(
    () => EXAMES_TUSS.find((e) => e.tuss === tuss) ?? null,
    [tuss],
  );

  function reset() {
    setTuss(EXAMES_TUSS[0]?.tuss ?? "");
    setObservacoes("");
    setLateralidade(LATERALIDADES[0]);
  }

  function abrirEdicao(e: ExamOrder) {
    setEditExame(e.exame);
    setEditTuss(e.tuss ?? "");
    setEditCategoria(e.categoria);
    setEditObs(e.observacoes ?? "");
    setEditLat(e.lateralidade ?? LATERALIDADES[0]);
    setEditing(e);
  }

  function salvar() {
    if (!selecionado) {
      toast.error("Selecione um exame.");
      return;
    }
    startTransition(async () => {
      const res = await criarPedidoExame({
        patientId,
        exam_name: selecionado.nome,
        tuss_code: selecionado.tuss,
        category: selecionado.categoria,
        notes: observacoes.trim() || undefined,
        laterality: lateralidade,
      });
      if (res?.ok) {
        toast.success("Exame solicitado.");
        setForm(false);
        reset();
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível solicitar o exame.");
      }
    });
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
        <Button onClick={() => setForm(true)}>
          <Plus className="h-4 w-4" /> Solicitar Exame
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
                          <span className="text-xs text-muted">
                            · {e.quando}
                          </span>
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
                        onPrint={() => imprimirExame(clinica, paciente, e)}
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

      {/* Modal de solicitação */}
      <Modal
        open={form}
        onClose={() => setForm(false)}
        title="Solicitar Exame"
        subtitle="Selecione o exame pelo código TUSS e adicione observações se necessário."
        className="max-w-xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pending}>
              {pending ? "Salvando…" : "Solicitar Exame"}
            </Button>
          </>
        }
      >
        <Select
          label="Exame (código TUSS)"
          value={tuss}
          onChange={(ev) => setTuss(ev.target.value)}
        >
          {EXAMES_TUSS.map((e) => (
            <option key={e.tuss} value={e.tuss}>
              {e.tuss} · {e.nome}
            </option>
          ))}
        </Select>

        {selecionado && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-muted">Categoria:</span>
            <CategoriaTag categoria={selecionado.categoria} />
          </div>
        )}

        <div className="mt-5">
          <Select
            label="Lateralidade"
            value={lateralidade}
            onChange={(ev) => setLateralidade(ev.target.value)}
          >
            {LATERALIDADES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </div>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Observações
          </span>
          <textarea
            rows={3}
            placeholder="Ex.: jejum de 8h, preparo, hipótese diagnóstica..."
            value={observacoes}
            onChange={(ev) => setObservacoes(ev.target.value)}
            className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
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
