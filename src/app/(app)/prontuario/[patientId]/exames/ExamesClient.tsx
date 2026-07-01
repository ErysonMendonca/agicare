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
import {
  EXAMES_TUSS,
  type ExamCategoria,
  type ExamOrder,
} from "@/lib/clinico/exames-shared";
import {
  criarPedidoExame,
  atualizarStatusExame,
  enviarResultadoExameEmail,
} from "@/lib/actions/exames";

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

export function ExamesClient({
  patientId,
  exames,
}: {
  patientId: string;
  exames: ExamOrder[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [updating, setUpdating] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [form, setForm] = useState(false);

  const [tuss, setTuss] = useState(EXAMES_TUSS[0]?.tuss ?? "");
  const [observacoes, setObservacoes] = useState("");

  const selecionado = useMemo(
    () => EXAMES_TUSS.find((e) => e.tuss === tuss) ?? null,
    [tuss],
  );

  function reset() {
    setTuss(EXAMES_TUSS[0]?.tuss ?? "");
    setObservacoes("");
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
          {exames.map((e) => (
            <FadeInUp key={e.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <FlaskConical className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-medium text-ink">{e.exame}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <CategoriaTag categoria={e.categoria} />
                        <Badge status={e.status === "concluido" ? "ok" : "warn"}>
                          {e.status === "concluido" ? "Concluído" : "Solicitado"}
                        </Badge>
                        {e.tuss && (
                          <span className="text-xs text-muted">
                            TUSS {e.tuss}
                          </span>
                        )}
                        <span className="text-xs text-muted">· {e.quando}</span>
                      </div>
                      {e.observacoes && (
                        <p className="mt-1.5 text-sm text-muted">
                          {e.observacoes}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-none flex-wrap items-center gap-2">
                    {e.status === "concluido" && (
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
                    <Button
                      size="sm"
                      variant={e.status === "concluido" ? "ghost" : "outline"}
                      disabled={pending && updating === e.id}
                      onClick={() => alternarStatus(e)}
                    >
                      {e.status === "concluido" ? (
                        <>
                          <RotateCcw className="h-4 w-4" /> Reabrir
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" /> Marcar concluído
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            </FadeInUp>
          ))}
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
    </>
  );
}
