"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity,
  HeartPulse,
  Thermometer,
  Weight,
  Ruler,
  Wind,
  Droplet,
  Gauge,
  FileClock,
  Stethoscope,
  Pill,
  FlaskConical,
  Download,
  Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { type Resumo } from "@/lib/data/prontuario";
import { getProntuarioManualUrl } from "@/lib/actions/pacientes";
import { PacienteCard } from "./PacienteCard";
import { ClinicoNav } from "./ClinicoNav";

type Aba = "historico" | "resumo";

/** Classificação de risco da triagem (Manchester) — rótulo + cor sólida do selo. */
const RISCO: Record<string, { label: string; dot: string; text: string }> = {
  vermelho: { label: "Vermelho — Emergência", dot: "bg-red-600", text: "text-red-700" },
  laranja: { label: "Laranja — Muito urgente", dot: "bg-orange-500", text: "text-orange-700" },
  amarelo: { label: "Amarelo — Urgente", dot: "bg-yellow-400", text: "text-yellow-700" },
  verde: { label: "Verde — Pouco urgente", dot: "bg-green-600", text: "text-green-700" },
  azul: { label: "Azul — Não urgente", dot: "bg-blue-600", text: "text-blue-700" },
};

export function ResumoView({ resumo }: { resumo: Resumo }) {
  const [aba, setAba] = useState<Aba>("resumo");
  const [baixandoAnexo, setBaixandoAnexo] = useState(false);
  const { patientId } = useParams<{ patientId: string }>();
  const { identificacao: id, vitais, triagem, evolucoes, prescricoesAtivas, examesSolicitados } =
    resumo;

  // Puxa o arquivo de prontuário manual anexado no cadastro (URL assinada).
  async function puxarAnexo() {
    if (!patientId) return;
    setBaixandoAnexo(true);
    try {
      const res = await getProntuarioManualUrl(patientId);
      if (res.error || !res.url) {
        toast.error(res.error ?? "Não foi possível abrir o arquivo.");
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Falha ao abrir o arquivo anexado.");
    } finally {
      setBaixandoAnexo(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Mesma moldura das demais seções: nome do paciente e, logo abaixo, a
          navegação única (Resumo/Evolução/Anamnese/…). Resumo fica ativo aqui. */}
      <div>
        <PacienteCard id={id} />
        {patientId && <ClinicoNav patientId={patientId} />}

        {/* Dados complementares de identificação do paciente. */}
        <Card className="p-5">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Campo rotulo="Data de Nascimento" valor={id.nascimento} />
            <Campo rotulo="Nº de Documento (CPF)" valor={id.cpf} />
            <Campo rotulo="Nome da Mãe" valor={id.nomeMae} />
            <Campo rotulo="Convênio" valor={id.convenio} />
            <Campo rotulo="Gênero" valor={id.genero} />
          </dl>
        </Card>
      </div>

      {/* Alterna o conteúdo do resumo: visão geral × prontuário manual. */}
      <div className="flex flex-wrap items-center gap-2">
        <TabButton ativo={aba === "resumo"} onClick={() => setAba("resumo")}>
          <Activity className="h-4 w-4" /> Visão geral
        </TabButton>
        <TabButton ativo={aba === "historico"} onClick={() => setAba("historico")}>
          <FileClock className="h-4 w-4" /> Histórico
        </TabButton>
      </div>

      {aba === "historico" ? (
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-ink">
              Histórico — Prontuário Manual
            </h3>
            {id.manualRecordPath && (
              <button
                type="button"
                onClick={puxarAnexo}
                disabled={baixandoAnexo}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {baixandoAnexo ? "Abrindo…" : "Puxar arquivo anexado"}
              </button>
            )}
          </div>
          {id.manualRecord ? (
            <p className="whitespace-pre-wrap text-sm text-ink">
              {id.manualRecord}
            </p>
          ) : id.manualRecordPath ? (
            <p className="inline-flex items-center gap-1.5 py-2 text-sm text-muted">
              <Paperclip className="h-3.5 w-3.5" />
              {id.manualRecordName ?? "Arquivo anexado no cadastro."}
            </p>
          ) : (
            <p className="py-8 text-center text-sm text-muted">
              Nenhum prontuário manual anexado no cadastro deste paciente.
            </p>
          )}
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Sinais vitais */}
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-ink">Sinais Vitais</h3>
              {vitais && (
                <span className="text-xs text-muted">
                  Última aferição: {vitais.recordedAt}
                </span>
              )}
            </div>
            {vitais ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Vital icon={<HeartPulse />} label="Pressão Arterial" value={vitais.pa} tone="text-red-500" />
                <Vital icon={<Activity />} label="Freq. Cardíaca" value={vitais.fc} tone="text-brand-600" />
                <Vital icon={<Wind />} label="Freq. Respiratória" value={vitais.fr} tone="text-blue-500" />
                <Vital icon={<Thermometer />} label="Temperatura" value={vitais.temp} tone="text-orange-500" />
                <Vital icon={<Weight />} label="Peso" value={vitais.peso} tone="text-purple-600" />
                <Vital icon={<Ruler />} label="Altura" value={vitais.altura} tone="text-ink" />
                <Vital icon={<Gauge />} label="Saturação O₂" value={vitais.spo2} tone="text-brand-600" />
                <Vital icon={<Droplet />} label="Glicemia" value={vitais.glucose} tone="text-red-500" />
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted">
                Nenhuma aferição de sinais vitais registrada.
              </p>
            )}
          </Card>

          {/* Triagem (sinais aferidos na triagem + classificação de risco). Só
              aparece quando o paciente passou pela triagem. */}
          {triagem && (
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-ink">Triagem</h3>
                <span className="text-xs text-muted">
                  Realizada: {triagem.recordedAt}
                </span>
              </div>
              {triagem.riskLevel && RISCO[triagem.riskLevel] && (
                <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-line bg-muted-surface px-3 py-1.5 text-sm font-medium">
                  <span
                    className={`h-3 w-3 flex-none rounded-full ${RISCO[triagem.riskLevel].dot}`}
                  />
                  <span className={RISCO[triagem.riskLevel].text}>
                    Classificação de risco: {RISCO[triagem.riskLevel].label}
                  </span>
                </div>
              )}
              {/* Registros novos: render genérico a partir do template (label:
                  value). Registros antigos (sem `data`): cai nos sinais vitais
                  estruturados de sempre. */}
              {triagem.data.length > 0 ? (
                <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                  {triagem.data
                    .filter((d) => d.id !== "notes")
                    .map((d) => (
                    <div
                      key={d.id}
                      className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 text-sm"
                    >
                      <span className="text-muted">{d.label}</span>
                      <span className="font-medium text-ink">{d.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Vital icon={<HeartPulse />} label="Pressão Arterial" value={triagem.pa} tone="text-red-500" />
                  <Vital icon={<Activity />} label="Freq. Cardíaca" value={triagem.fc} tone="text-brand-600" />
                  <Vital icon={<Wind />} label="Freq. Respiratória" value={triagem.fr} tone="text-blue-500" />
                  <Vital icon={<Thermometer />} label="Temperatura" value={triagem.temp} tone="text-orange-500" />
                  <Vital icon={<Weight />} label="Peso" value={triagem.peso} tone="text-purple-600" />
                  <Vital icon={<Ruler />} label="Altura" value={triagem.altura} tone="text-ink" />
                  <Vital icon={<Gauge />} label="Saturação O₂" value={triagem.spo2} tone="text-brand-600" />
                  <Vital icon={<Droplet />} label="Glicemia" value={triagem.glucose} tone="text-red-500" />
                </div>
              )}
              {triagem.notes && (
                <p className="mt-3 text-sm text-muted">
                  <span className="font-medium text-ink">Observações:</span>{" "}
                  {triagem.notes}
                </p>
              )}
            </Card>
          )}

          {/* Evoluções */}
          <Card className="p-5">
            <h3 className="mb-4 font-semibold text-ink">Histórico de Evoluções</h3>
            {evolucoes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                Nenhuma evolução registrada.
              </p>
            ) : (
              <ol className="space-y-4">
                {evolucoes.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-50 text-brand-600">
                        <Stethoscope className="h-4 w-4" />
                      </span>
                      <span className="mt-1 w-px flex-1 bg-line" />
                    </div>
                    <div className="pb-2">
                      <div className="flex flex-wrap items-center gap-x-3 text-sm">
                        <span className="font-medium text-ink">{e.profissional}</span>
                        <span className="text-xs text-muted">{e.data}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted">{e.conteudo}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {/* Prescrições Ativas — lista inline (último itinerário) */}
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-ink">Prescrições Ativas</h3>
              {patientId && (
                <Link
                  href={`/prontuario/${patientId}/prescricao`}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  <Pill className="h-4 w-4" /> Gerenciar
                </Link>
              )}
            </div>
            {prescricoesAtivas.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                Nenhuma prescrição ativa.
              </p>
            ) : (
              <ul className="space-y-2">
                {prescricoesAtivas.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-muted-surface p-3 text-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                        <Pill className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-medium text-ink">{m.medicamento}</p>
                        <p className="text-xs text-muted">{m.dosagem}</p>
                      </div>
                    </div>
                    <Badge status="active">{m.duracao}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Exames Solicitados — lista inline com status */}
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-ink">Exames Solicitados</h3>
              {patientId && (
                <Link
                  href={`/prontuario/${patientId}/exames`}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  <FlaskConical className="h-4 w-4" /> Gerenciar
                </Link>
              )}
            </div>
            {examesSolicitados.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                Nenhum exame solicitado.
              </p>
            ) : (
              <ul className="space-y-2">
                {examesSolicitados.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-muted-surface p-3 text-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                        <FlaskConical className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-medium text-ink">{e.nome}</p>
                        <p className="text-xs capitalize text-muted">
                          {e.categoria}
                        </p>
                      </div>
                    </div>
                    <Badge status={e.status === "concluido" ? "ok" : "wait"}>
                      {e.status === "concluido" ? "Concluído" : "Solicitado"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{rotulo}</dt>
      <dd className="mt-0.5 font-medium text-ink">{valor}</dd>
    </div>
  );
}

function TabButton({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        ativo
          ? "inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white"
          : "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-black/5"
      }
    >
      {children}
    </button>
  );
}

function Vital({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-muted-surface p-3">
      <div className={`flex items-center gap-1.5 text-xs text-muted`}>
        <span className={`[&>svg]:h-4 [&>svg]:w-4 ${tone}`}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-ink">{value}</div>
    </div>
  );
}
