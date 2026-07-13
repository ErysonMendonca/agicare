"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pill,
  HeartHandshake,
  Trash2,
  CheckSquare,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { cn } from "@/lib/utils";
import { DocumentActions } from "@/components/clinico/DocumentActions";
import { CancelarDocumentoModal } from "@/components/clinico/CancelarDocumentoModal";
import {
  type Prescricao,
  type Medicamento,
  CUIDADOS_PREDEFINIDOS,
  FREQUENCIAS,
  VIAS_ADMINISTRACAO,
} from "@/lib/clinico/prescricao-shared";
import {
  criarPrescricao,
  updatePrescricao,
  deletePrescricao,
} from "@/lib/actions/prescricao";

type MedRow = {
  productId: string;
  nome: string;
  concentracao: string;
  posologia: string;
  via: string;
  duracao: string;
  frequencia: string;
  observacoes: string;
};

type CuidadoRow = {
  nome: string;
  frequencia: string;
  duracao: string;
  observacoes: string;
};

const novoMed = (): MedRow => ({
  productId: "",
  nome: "",
  concentracao: "",
  posologia: "",
  via: VIAS_ADMINISTRACAO[0],
  duracao: "",
  frequencia: FREQUENCIAS[1].label,
  observacoes: "",
});

/** Garante que a via exista no menu (senão usa a padrão). */
const viaValida = (v: string) =>
  (VIAS_ADMINISTRACAO as readonly string[]).includes(v)
    ? v
    : VIAS_ADMINISTRACAO[0];

const novoCuidado = (): CuidadoRow => ({
  nome: CUIDADOS_PREDEFINIDOS[0],
  frequencia: FREQUENCIAS[1].label,
  duracao: "",
  observacoes: "",
});

/** Normaliza valores vindos da listagem (que usa "—" para vazio). */
const limpar = (v: string) => (v === "—" ? "" : v);

/** Garante que a frequência exista no menu (senão usa o padrão). */
const freqValida = (f: string) =>
  FREQUENCIAS.some((opt) => opt.label === f) ? f : FREQUENCIAS[1].label;

/** Garante que o cuidado exista no menu pré-definido. */
const cuidadoValido = (n: string) =>
  (CUIDADOS_PREDEFINIDOS as readonly string[]).includes(n)
    ? n
    : CUIDADOS_PREDEFINIDOS[0];

export function PrescricaoClient({
  patientId,
  prescricoes,
  medicamentos,
}: {
  patientId: string;
  prescricoes: Prescricao[];
  medicamentos: Medicamento[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cancelar, setCancelar] = useState<Prescricao | null>(null);
  const [ver, setVer] = useState<Prescricao | null>(null);

  const [meds, setMeds] = useState<MedRow[]>([]);
  const [cuidados, setCuidados] = useState<CuidadoRow[]>([]);
  const [obs, setObs] = useState("");

  function reset() {
    setMeds([]);
    setCuidados([]);
    setObs("");
  }

  /** Abre o modal em branco para uma nova prescrição. */
  function abrirNova() {
    setEditingId(null);
    reset();
    setForm(true);
  }

  /** Abre o modal pré-preenchido para editar uma prescrição existente. */
  function abrirEdicao(p: Prescricao) {
    setEditingId(p.id);
    setMeds(
      p.medicamentos.map((m) => ({
        productId: "",
        nome: m.nome,
        concentracao: limpar(m.concentracao),
        posologia: limpar(m.posologia),
        via: viaValida(m.via),
        duracao: limpar(m.duracao),
        frequencia: freqValida(m.frequencia),
        observacoes: limpar(m.observacoes),
      })),
    );
    setCuidados(
      p.cuidados.map((c) => ({
        nome: cuidadoValido(c.nome),
        frequencia: freqValida(c.frequencia),
        duracao: limpar(c.duracao),
        observacoes: limpar(c.observacoes),
      })),
    );
    setObs(limpar(p.observacoes));
    setForm(true);
  }

  /** Fecha o modal e zera o estado (evita resíduo entre criar/editar). */
  function fecharForm() {
    setForm(false);
    setEditingId(null);
    reset();
  }

  /** Ao escolher um medicamento do catálogo, traz a concentração do cadastro. */
  function selecionarMed(idx: number, nome: string) {
    const cat = medicamentos.find((m) => m.nome === nome);
    setMeds((rows) =>
      rows.map((r, i) =>
        i === idx
          ? {
              ...r,
              nome,
              productId: cat?.id ?? "",
              concentracao: cat?.concentracao ?? r.concentracao,
            }
          : r,
      ),
    );
  }

  function salvar() {
    startTransition(async () => {
      const payload = {
        patientId,
        observacoes: obs,
        medicamentos: meds,
        cuidados,
      };
      const res = editingId
        ? await updatePrescricao(editingId, payload)
        : await criarPrescricao(payload);
      if (res?.ok) {
        toast.success(
          editingId ? "Prescrição atualizada." : "Prescrição registrada.",
        );
        fecharForm();
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível salvar a prescrição.");
      }
    });
  }

  function confirmarCancelamento(motivo: string) {
    if (!cancelar) return;
    const alvo = cancelar;
    startTransition(async () => {
      const res = await deletePrescricao(alvo.id, patientId, motivo);
      if (res?.ok) {
        toast.success("Prescrição cancelada.");
        setCancelar(null);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível cancelar a prescrição.");
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => router.push(`/prontuario/${patientId}/checagem`)}
        >
          <CheckSquare className="h-4 w-4" /> Ver Checagem
        </Button>
        <Button onClick={abrirNova}>
          <Plus className="h-4 w-4" /> Nova Prescrição
        </Button>
      </div>

      {prescricoes.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-5 py-16 text-center">
          <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted-surface text-muted">
            <Pill className="h-7 w-7" />
          </span>
          <p className="font-medium text-ink">Nenhuma prescrição registrada</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            Adicione medicamentos do estoque e cuidados para este paciente.
          </p>
        </Card>
      ) : (
        <Stagger className="flex flex-col gap-3">
          {prescricoes.map((p) => (
            <FadeInUp key={p.id}>
              <Card className="p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div
                    className={cn(
                      p.cancelledAt !== null &&
                        "text-status-danger [&_*]:text-status-danger",
                    )}
                  >
                    <p className="font-medium text-ink">{p.profissional}</p>
                    <p className="text-xs text-muted">{p.dataHora}</p>
                  </div>
                  <DocumentActions
                    cancelled={p.cancelledAt !== null}
                    cancelReason={p.cancelReason}
                    pending={pending}
                    onView={() => setVer(p)}
                    onEdit={() => abrirEdicao(p)}
                    onPrint={() =>
                      router.push(`/prontuario/${patientId}/receita?p=${p.id}`)
                    }
                    onCancel={() => setCancelar(p)}
                  />
                </div>

                <div
                  className={cn(
                    p.cancelledAt !== null &&
                      "text-status-danger [&_*]:text-status-danger",
                  )}
                >
                {p.medicamentos.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-2 text-xs font-semibold uppercase text-muted">
                      Medicamentos
                    </p>
                    <ul className="space-y-2">
                      {p.medicamentos.map((m) => (
                        <li key={m.id} className="rounded-lg border border-line bg-muted-surface p-3 text-sm">
                          <span className="font-medium text-ink">
                            {m.nome} {m.concentracao !== "—" ? m.concentracao : ""}
                          </span>
                          <span className="text-muted">
                            {" "}
                            — {m.posologia}
                            {m.via && m.via !== "—" ? ` · ${m.via}` : ""} ·{" "}
                            {m.frequencia} · {m.duracao}
                          </span>
                          {m.observacoes && (
                            <p className="mt-1 text-xs text-muted">{m.observacoes}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {p.cuidados.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-muted">
                      Cuidados
                    </p>
                    <ul className="space-y-2">
                      {p.cuidados.map((c) => (
                        <li key={c.id} className="rounded-lg border border-line bg-muted-surface p-3 text-sm">
                          <span className="font-medium text-ink">{c.nome}</span>
                          <span className="text-muted">
                            {" "}
                            — {c.frequencia} · {c.duracao}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {p.observacoes && (
                  <p className="mt-3 text-sm text-muted">Obs.: {p.observacoes}</p>
                )}
                </div>
              </Card>
            </FadeInUp>
          ))}
        </Stagger>
      )}

      {/* Modal de nova / editar prescrição */}
      <Modal
        open={form}
        onClose={fecharForm}
        title={editingId ? "Editar Prescrição" : "Nova Prescrição"}
        subtitle="Medicamentos vêm do estoque; cuidados do menu padrão."
        className="max-w-3xl"
        footer={
          <>
            <Button variant="outline" onClick={fecharForm}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pending}>
              {pending
                ? "Salvando…"
                : editingId
                  ? "Salvar Alterações"
                  : "Salvar Prescrição"}
            </Button>
          </>
        }
      >
        {/* Medicamentos */}
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="inline-flex items-center gap-2 font-semibold text-ink">
              <Pill className="h-4 w-4 text-brand-600" /> Medicamentos
            </h3>
            <Button size="sm" variant="outline" onClick={() => setMeds((m) => [...m, novoMed()])}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>

          {meds.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line py-4 text-center text-sm text-muted">
              Nenhum medicamento adicionado.
            </p>
          ) : (
            <div className="space-y-3">
              {meds.map((m, idx) => (
                <div key={idx} className="rounded-xl border border-line p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-ink">
                        Medicamento (estoque)
                      </span>
                      <input
                        list="lista-medicamentos"
                        value={m.nome}
                        onChange={(e) => selecionarMed(idx, e.target.value)}
                        placeholder="Digite para buscar..."
                        className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                      />
                    </label>
                    <Input
                      label="Concentração"
                      value={m.concentracao}
                      readOnly
                      placeholder="Do cadastro"
                    />
                    <Input
                      label="Posologia"
                      placeholder="Ex.: 1 cp"
                      value={m.posologia}
                      onChange={(e) =>
                        setMeds((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, posologia: e.target.value } : r)),
                        )
                      }
                    />
                    <Select
                      label="Via de administração"
                      value={m.via}
                      onChange={(e) =>
                        setMeds((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, via: e.target.value } : r)),
                        )
                      }
                    >
                      {VIAS_ADMINISTRACAO.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </Select>
                    <Select
                      label="Frequência"
                      value={m.frequencia}
                      onChange={(e) =>
                        setMeds((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, frequencia: e.target.value } : r)),
                        )
                      }
                    >
                      {FREQUENCIAS.map((f) => (
                        <option key={f.label}>{f.label}</option>
                      ))}
                    </Select>
                    <Input
                      label="Duração"
                      placeholder="Ex.: 7 dias"
                      value={m.duracao}
                      onChange={(e) =>
                        setMeds((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, duracao: e.target.value } : r)),
                        )
                      }
                    />
                    <Input
                      label="Observações"
                      placeholder="Opcional"
                      value={m.observacoes}
                      onChange={(e) =>
                        setMeds((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, observacoes: e.target.value } : r)),
                        )
                      }
                    />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setMeds((rows) => rows.filter((_, i) => i !== idx))}
                      className="text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" /> Remover
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <datalist id="lista-medicamentos">
            {medicamentos.map((m) => (
              <option key={m.id} value={m.nome} />
            ))}
          </datalist>
        </section>

        {/* Cuidados */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="inline-flex items-center gap-2 font-semibold text-ink">
              <HeartHandshake className="h-4 w-4 text-brand-600" /> Cuidados
            </h3>
            <Button size="sm" variant="outline" onClick={() => setCuidados((c) => [...c, novoCuidado()])}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>

          {cuidados.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line py-4 text-center text-sm text-muted">
              Nenhum cuidado adicionado.
            </p>
          ) : (
            <div className="space-y-3">
              {cuidados.map((c, idx) => (
                <div key={idx} className="rounded-xl border border-line p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Select
                      label="Cuidado"
                      value={c.nome}
                      onChange={(e) =>
                        setCuidados((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, nome: e.target.value } : r)),
                        )
                      }
                    >
                      {CUIDADOS_PREDEFINIDOS.map((nome) => (
                        <option key={nome}>{nome}</option>
                      ))}
                    </Select>
                    <Select
                      label="Frequência"
                      value={c.frequencia}
                      onChange={(e) =>
                        setCuidados((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, frequencia: e.target.value } : r)),
                        )
                      }
                    >
                      {FREQUENCIAS.map((f) => (
                        <option key={f.label}>{f.label}</option>
                      ))}
                    </Select>
                    <Input
                      label="Duração"
                      placeholder="Ex.: 3 dias"
                      value={c.duracao}
                      onChange={(e) =>
                        setCuidados((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, duracao: e.target.value } : r)),
                        )
                      }
                    />
                    <Input
                      label="Observações"
                      placeholder="Opcional"
                      value={c.observacoes}
                      onChange={(e) =>
                        setCuidados((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, observacoes: e.target.value } : r)),
                        )
                      }
                    />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCuidados((rows) => rows.filter((_, i) => i !== idx))}
                      className="text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" /> Remover
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Observações gerais
          </span>
          <textarea
            rows={2}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Observações da prescrição..."
            className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </Modal>

      {/* Modal de visualização (read-only) */}
      <Modal
        open={ver !== null}
        onClose={() => setVer(null)}
        title="Prescrição"
        subtitle={ver ? `${ver.profissional} · ${ver.dataHora}` : undefined}
        className="max-w-2xl"
      >
        {ver && (
          <div className="space-y-4 text-sm">
            {ver.medicamentos.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-muted">
                  Medicamentos
                </p>
                <ul className="space-y-2">
                  {ver.medicamentos.map((m) => (
                    <li
                      key={m.id}
                      className="rounded-lg border border-line bg-muted-surface p-3"
                    >
                      <span className="font-medium text-ink">
                        {m.nome} {m.concentracao !== "—" ? m.concentracao : ""}
                      </span>
                      <span className="text-muted">
                        {" "}
                        — {m.posologia}
                        {m.via && m.via !== "—" ? ` · ${m.via}` : ""} ·{" "}
                        {m.frequencia} · {m.duracao}
                      </span>
                      {m.observacoes && (
                        <p className="mt-1 text-xs text-muted">{m.observacoes}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {ver.cuidados.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-muted">
                  Cuidados
                </p>
                <ul className="space-y-2">
                  {ver.cuidados.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-lg border border-line bg-muted-surface p-3"
                    >
                      <span className="font-medium text-ink">{c.nome}</span>
                      <span className="text-muted">
                        {" "}
                        — {c.frequencia} · {c.duracao}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {ver.observacoes && (
              <p className="text-muted">Obs.: {ver.observacoes}</p>
            )}
          </div>
        )}
      </Modal>

      {/* Modal de cancelamento (não destrutivo) */}
      <CancelarDocumentoModal
        open={cancelar !== null}
        onClose={() => setCancelar(null)}
        onConfirm={confirmarCancelamento}
        pending={pending}
        titulo="Cancelar prescrição"
      />
    </>
  );
}
