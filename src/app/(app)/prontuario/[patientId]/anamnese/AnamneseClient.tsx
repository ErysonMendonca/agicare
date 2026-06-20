"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  ClipboardList,
  AlertTriangle,
  TriangleAlert,
  ShieldCheck,
  Eye,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import {
  chaveEspecialidade,
  ESPECIALIDADES_ANAMNESE,
} from "@/lib/clinico/anamnese-config";
import {
  type AnamneseField,
  type AnamneseTemplate,
} from "@/lib/data/anamnese-templates.shared";
import { type AnamneseRegistro } from "@/lib/data/anamnese";
import { gerarAnamnese } from "@/lib/actions/anamnese";
import { LousaRascunho } from "@/components/clinico/LousaRascunho";
import { type AnamneseLousa } from "@/lib/data/anamnese-files";

const textareaCls =
  "w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function AnamneseClient({
  patientId,
  anamneses,
  minhaEspecialidade,
  templates,
  lousas = [],
}: {
  patientId: string;
  anamneses: AnamneseRegistro[];
  minhaEspecialidade: string | null;
  templates: AnamneseTemplate[];
  lousas?: AnamneseLousa[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(false);
  const [ver, setVer] = useState<AnamneseRegistro | null>(null);

  const especialidadeInicial = useMemo(() => {
    const chave = chaveEspecialidade(minhaEspecialidade);
    const match = ESPECIALIDADES_ANAMNESE.find(
      (e) => chaveEspecialidade(e.value) === chave,
    );
    return match?.value ?? "Geral";
  }, [minhaEspecialidade]);

  const [specialty, setSpecialty] = useState<string>(especialidadeInicial);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [consent, setConsent] = useState(false); // LGPD (obrigatório)
  const [consentAtendimento, setConsentAtendimento] = useState(false); // obrigatório
  const [consentImagem, setConsentImagem] = useState(false); // opcional
  const [signature, setSignature] = useState("");

  // Mapa especialidade → campos (vem do template salvo no banco ou do fallback).
  const fieldsBySpecialty = useMemo(() => {
    const m = new Map<string, AnamneseField[]>();
    for (const t of templates) m.set(t.specialty, t.fields);
    return m;
  }, [templates]);

  // Agrupa os campos da especialidade selecionada por seção (preserva a ordem).
  const blocos = useMemo(() => {
    const campos = fieldsBySpecialty.get(specialty) ?? [];
    const grupos: { titulo: string; campos: AnamneseField[] }[] = [];
    const indice = new Map<string, number>();
    for (const campo of campos) {
      const titulo = campo.section?.trim() || "Anamnese";
      let i = indice.get(titulo);
      if (i === undefined) {
        i = grupos.length;
        indice.set(titulo, i);
        grupos.push({ titulo, campos: [] });
      }
      grupos[i].campos.push(campo);
    }
    return grupos;
  }, [fieldsBySpecialty, specialty]);

  // Regra: só gera quem é da especialidade da ficha (em demo, minha = null → liberado).
  const podeGerar =
    minhaEspecialidade == null ||
    chaveEspecialidade(minhaEspecialidade) === chaveEspecialidade(specialty);

  const getStr = (key: string) =>
    typeof values[key] === "string" ? (values[key] as string) : "";
  const getArr = (key: string) =>
    Array.isArray(values[key]) ? (values[key] as string[]) : [];
  const getBool = (key: string) => values[key] === true;
  const setValue = (key: string, val: unknown) =>
    setValues((v) => ({ ...v, [key]: val }));
  const toggleOpcao = (key: string, opt: string) => {
    const atual = getArr(key);
    setValue(key, atual.includes(opt) ? atual.filter((o) => o !== opt) : [...atual, opt]);
  };

  // Pode gerar: LGPD + Atendimento marcados e assinatura preenchida.
  const consentimentosOk = consent && consentAtendimento && signature.trim() !== "";

  function reset() {
    setValues({});
    setConsent(false);
    setConsentAtendimento(false);
    setConsentImagem(false);
    setSignature("");
    setSpecialty(especialidadeInicial);
  }

  function gerar() {
    startTransition(async () => {
      const res = await gerarAnamnese({
        patientId,
        specialty,
        fields: values,
        consent,
        consentAtendimento,
        consentImagem,
        signature,
      });
      if (res?.ok) {
        toast.success("Anamnese gerada.");
        setForm(false);
        reset();
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível gerar a anamnese.");
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setForm(true)}>
          <Plus className="h-4 w-4" /> Nova Anamnese
        </Button>
      </div>

      {anamneses.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-5 py-16 text-center">
          <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted-surface text-muted">
            <ClipboardList className="h-7 w-7" />
          </span>
          <p className="font-medium text-ink">Nenhuma anamnese registrada</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            Gere a anamnese da especialidade da ficha. Você pode visualizar
            anamneses de outras especialidades.
          </p>
        </Card>
      ) : (
        <Stagger className="flex flex-col gap-3">
          {anamneses.map((a) => (
            <FadeInUp key={a.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <ClipboardList className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink">{a.specialty}</p>
                      {a.campos?.podo_risco_pre_diabetico === true && (
                        <Badge status="danger">
                          <TriangleAlert className="h-3 w-3" /> Risco pré-diabético
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {a.profissional} · {a.dataHora}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setVer(a)}>
                  <Eye className="h-4 w-4" /> Ver
                </Button>
              </Card>
            </FadeInUp>
          ))}
        </Stagger>
      )}

      {/* Lousa / rascunho clínico (desenho sobre imagem) */}
      <div className="mt-6">
        <LousaRascunho
          patientId={patientId}
          lousas={lousas}
          onSaved={() => router.refresh()}
        />
      </div>

      {/* Modal de geração */}
      <Modal
        open={form}
        onClose={() => setForm(false)}
        title="Nova Anamnese"
        subtitle="Histórico Geral obrigatório + módulo da especialidade."
        className="max-w-2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(false)}>
              Cancelar
            </Button>
            <Button onClick={gerar} disabled={pending || !podeGerar || !consentimentosOk}>
              {pending ? "Gerando…" : "Gerar Anamnese"}
            </Button>
          </>
        }
      >
        <Select
          label="Especialidade da ficha"
          value={specialty}
          onChange={(e) => {
            setSpecialty(e.target.value);
            setValues({});
          }}
        >
          {ESPECIALIDADES_ANAMNESE.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </Select>

        {!podeGerar && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-600">
            <Lock className="mt-0.5 h-4 w-4 flex-none" />
            Sua especialidade ({minhaEspecialidade}) não corresponde à da ficha.
            Você pode visualizar, mas não gerar esta anamnese.
          </div>
        )}

        <div className="mt-5 space-y-6">
          {blocos.map((bloco) => (
            <fieldset key={bloco.titulo} className="rounded-xl border border-line p-4">
              <legend className="px-1 text-sm font-semibold text-ink">
                {bloco.titulo}
              </legend>
              <div className="space-y-4">
                {bloco.campos.map((campo) => (
                  <CampoView
                    key={campo.id}
                    campo={campo}
                    valorTexto={getStr(campo.id)}
                    valorArray={getArr(campo.id)}
                    valorBool={getBool(campo.id)}
                    onTexto={(v) => setValue(campo.id, v)}
                    onToggle={(opt) => toggleOpcao(campo.id, opt)}
                    onBool={(v) => setValue(campo.id, v)}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        {/* Consentimentos */}
        <div className="mt-6 rounded-xl border border-line p-4">
          <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <ShieldCheck className="h-4 w-4 text-green-600" /> Consentimentos
          </h3>

          <div className="space-y-3">
            {/* LGPD — obrigatório */}
            <label className="flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-500"
              />
              <span>
                <span className="font-medium">Consentimento LGPD</span>
                <span className="text-red-500"> *</span> — Declaro que o paciente foi
                informado e consente com o tratamento dos dados de saúde conforme a LGPD.
              </span>
            </label>

            {/* Atendimento — obrigatório */}
            <label className="flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={consentAtendimento}
                onChange={(e) => setConsentAtendimento(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-500"
              />
              <span>
                <span className="font-medium">Consentimento para Atendimento</span>
                <span className="text-red-500"> *</span> — O paciente está ciente e
                concorda com a realização do atendimento e dos procedimentos propostos.
              </span>
            </label>

            {/* Registro de Imagens — opcional */}
            <label className="flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={consentImagem}
                onChange={(e) => setConsentImagem(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-500"
              />
              <span>
                <span className="font-medium">Registro de Imagens</span>
                <span className="text-muted"> (opcional)</span> — O paciente autoriza o
                registro de fotos para acompanhamento clínico da evolução.
              </span>
            </label>
          </div>

          {/* Aviso Legal */}
          <div className="mt-4 rounded-lg border border-line bg-muted-surface p-3 text-xs leading-relaxed text-muted">
            <span className="font-semibold text-ink">Aviso Legal:</span> os dados de saúde
            são considerados dados pessoais sensíveis (Lei nº 13.709/2018 — LGPD) e o seu
            tratamento ocorre exclusivamente para fins de assistência à saúde, sob sigilo
            profissional. O acesso é restrito à equipe clínica autorizada, e o registro de
            imagens depende de autorização específica do paciente, que pode ser revogada a
            qualquer momento.
          </div>

          <div className="mt-3">
            <SignaturePad
              label="Assinatura digital do profissional"
              value={signature}
              onChange={setSignature}
              required
            />
          </div>
        </div>
      </Modal>

      {/* Modal Ver */}
      <Modal
        open={ver !== null}
        onClose={() => setVer(null)}
        title={ver ? `Anamnese — ${ver.specialty}` : "Anamnese"}
        subtitle={ver ? `${ver.profissional} · ${ver.dataHora}` : undefined}
        className="max-w-2xl"
      >
        {ver && (
          <div className="space-y-3 text-sm">
            {ver.campos?.podo_risco_pre_diabetico === true && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-600">
                <TriangleAlert className="h-4 w-4" /> Alerta: risco pré-diabético sinalizado.
              </div>
            )}
            {Object.entries(ver.campos).map(([key, val]) => (
              <div key={key} className="border-b border-line pb-2">
                <p className="text-xs uppercase text-muted">{key}</p>
                <p className="text-ink">{formatarValor(val)}</p>
              </div>
            ))}
            <div className="pt-2 text-xs text-muted">
              Consentimento LGPD: {ver.consentimento ? "registrado" : "não registrado"}
              {ver.assinatura && !isAssinaturaImagem(ver.assinatura)
                ? ` · Assinado por ${ver.assinatura}`
                : ""}
            </div>
            {ver.assinatura && isAssinaturaImagem(ver.assinatura) && (
              <div>
                <p className="mb-1.5 text-xs uppercase text-muted">Assinatura</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ver.assinatura}
                  alt="Assinatura digital do profissional"
                  className="max-h-32 rounded-lg border border-line bg-white"
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

/** Distingue assinaturas novas (imagem base64) de registros legados (texto). */
function isAssinaturaImagem(valor: string): boolean {
  return valor.startsWith("data:image/");
}

function formatarValor(val: unknown): string {
  if (Array.isArray(val)) return val.length ? val.join(", ") : "—";
  if (typeof val === "boolean") return val ? "Sim" : "Não";
  if (val == null || val === "") return "—";
  return String(val);
}

function CampoView({
  campo,
  valorTexto,
  valorArray,
  valorBool,
  onTexto,
  onToggle,
  onBool,
}: {
  campo: AnamneseField;
  valorTexto: string;
  valorArray: string[];
  valorBool: boolean;
  onTexto: (v: string) => void;
  onToggle: (opt: string) => void;
  onBool: (v: boolean) => void;
}) {
  if (campo.tipo === "checkboxes") {
    return (
      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink">{campo.label}</span>
        <div className="flex flex-wrap gap-2">
          {(campo.options ?? []).map((opt) => {
            const ativo = valorArray.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onToggle(opt)}
                className={
                  ativo
                    ? "rounded-full bg-brand-500 px-3 py-1 text-xs font-medium text-white"
                    : "rounded-full border border-line px-3 py-1 text-xs font-medium text-muted hover:bg-muted-surface"
                }
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (campo.tipo === "select") {
    return (
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">{campo.label}</span>
        <select
          value={valorTexto}
          onChange={(e) => onTexto(e.target.value)}
          className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Selecione…</option>
          {(campo.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (campo.tipo === "textarea") {
    return (
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">{campo.label}</span>
        <textarea
          rows={2}
          value={valorTexto}
          placeholder={campo.placeholder}
          onChange={(e) => onTexto(e.target.value)}
          className={textareaCls}
        />
      </label>
    );
  }

  if (campo.tipo === "texto") {
    const amarelo = campo.destaque === "amarelo";
    return (
      <label className="block">
        <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
          {amarelo && <AlertTriangle className="h-4 w-4 text-orange-500" />}
          {campo.label}
        </span>
        <input
          value={valorTexto}
          placeholder={campo.placeholder}
          onChange={(e) => onTexto(e.target.value)}
          className={
            amarelo
              ? "h-10 w-full rounded-lg border border-orange-300 bg-orange-50 px-3 text-sm text-ink placeholder:text-orange-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              : "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          }
        />
      </label>
    );
  }

  // sim_nao
  const alertaVermelho = campo.alertaSim === "vermelho" && valorBool;
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{campo.label}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onBool(true)}
          className={
            valorBool
              ? "rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white"
              : "rounded-lg border border-line px-4 py-1.5 text-sm font-medium text-muted hover:bg-muted-surface"
          }
        >
          Sim
        </button>
        <button
          type="button"
          onClick={() => onBool(false)}
          className={
            !valorBool
              ? "rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white"
              : "rounded-lg border border-line px-4 py-1.5 text-sm font-medium text-muted hover:bg-muted-surface"
          }
        >
          Não
        </button>
      </div>
      {alertaVermelho && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-600">
          <TriangleAlert className="h-4 w-4 flex-none" />
          Atenção: condição de risco sinalizada — avaliar conduta com cautela.
        </div>
      )}
    </div>
  );
}
