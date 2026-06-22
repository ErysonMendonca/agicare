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
  CheckSquare,
  ClipboardList,
  Bone,
  FileText,
  Download,
  Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { type Resumo } from "@/lib/data/prontuario";
import { getProntuarioManualUrl } from "@/lib/actions/pacientes";

type Aba = "historico" | "resumo";

export function ResumoView({ resumo }: { resumo: Resumo }) {
  const [aba, setAba] = useState<Aba>("resumo");
  const [baixandoAnexo, setBaixandoAnexo] = useState(false);
  const { patientId } = useParams<{ patientId: string }>();
  const { identificacao: id, vitais, evolucoes, prescricoesAtivas, examesSolicitados } =
    resumo;

  // Seções do prontuário (mesma ordem do ClinicoNav, sem "Resumo" p/ não duplicar).
  const base = `/prontuario/${patientId}`;
  const secoes = [
    { href: `${base}/evolucao`, label: "Evolução", icon: Stethoscope },
    { href: `${base}/prescricao`, label: "Prescrição", icon: Pill },
    { href: `${base}/checagem`, label: "Checagem", icon: CheckSquare },
    { href: `${base}/enfermagem`, label: "Enfermagem", icon: HeartPulse },
    { href: `${base}/anamnese`, label: "Anamnese", icon: ClipboardList },
    { href: `${base}/exames`, label: "Exames", icon: FlaskConical },
    { href: `${base}/protetico`, label: "Protético", icon: Bone },
    { href: `${base}/documentos`, label: "Documentos", icon: FileText },
  ];

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
      {/* Identificação superior */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-brand-500 text-lg font-bold text-white">
              {id.nome.charAt(0)}
            </span>
            <div>
              <h2 className="text-lg font-semibold text-ink">{id.nome}</h2>
              <p className="text-sm text-muted">
                Registro {id.registro} · {id.idade} · {id.genero}
              </p>
            </div>
          </div>
          <Badge status="active">Atendimento em andamento</Badge>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Campo rotulo="Data de Nascimento" valor={id.nascimento} />
          <Campo rotulo="Nome da Mãe" valor={id.nomeMae} />
          <Campo rotulo="Convênio" valor={id.convenio} />
          <Campo rotulo="Gênero" valor={id.genero} />
        </dl>
      </Card>

      {/* Navegação clínica unificada: Histórico/Resumo (abas locais) + seções
          do prontuário (links), todas no mesmo estilo p/ ficar homogêneo. */}
      <nav className="flex flex-wrap items-center gap-2">
        <TabButton ativo={aba === "historico"} onClick={() => setAba("historico")}>
          <FileClock className="h-4 w-4" /> Histórico
        </TabButton>
        <TabButton ativo={aba === "resumo"} onClick={() => setAba("resumo")}>
          <Activity className="h-4 w-4" /> Resumo
        </TabButton>
        {patientId &&
          secoes.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-black/5 hover:text-ink"
              >
                <Icon className="h-4 w-4" /> {s.label}
              </Link>
            );
          })}
      </nav>

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
