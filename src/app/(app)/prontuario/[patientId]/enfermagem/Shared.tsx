"use client";

import { type ReactNode } from "react";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { type OpcaoPaciente } from "@/lib/data/enfermagem";
import {
  abrirImpressao,
  camposIdentPadrao,
  esc,
  identPacienteHTML,
  limpo,
  montarDocumentoBase,
  rodapeAssinaturaProfissional,
  type ClinicaImpressao,
} from "@/lib/clinico/documento-impressao";

/** Par rótulo→valor exibido nos modais de visualização / impressão. */
export type CampoDetalhe = { label: string; value: string };

/** Cabeçalho dos documentos de enfermagem (clínica + identificação do paciente). */
export type DocCabecalho = {
  clinica: ClinicaImpressao;
  paciente: {
    nome: string;
    registro: string;
    idade: string;
    convenio: string;
    atendimentoCodigo: string | null;
    plano: string;
    dataAdmissao: string;
    nascimento: string;
    sexo: string;
    nomeMae: string;
  };
};

/**
 * Impressão de um documento de enfermagem no modelo padrão compartilhado.
 * `atendimento` sobrepõe o nº de atendimento do cabeçalho (fixo por paciente)
 * pelo do REGISTRO impresso, quando o chamador o tiver (ex.: anotação antiga).
 */
export function imprimirDocumento(
  cabecalho: DocCabecalho,
  titulo: string,
  campos: CampoDetalhe[],
  atendimento?: string | null,
) {
  if (typeof window === "undefined") return;
  const { clinica, paciente } = cabecalho;

  const corpo = campos
    .filter((c) => c.value && c.value !== "—")
    .map(
      (c) =>
        `<div class="campo"><span class="k">${esc(c.label)}</span><span class="v">${esc(c.value)}</span></div>`,
    )
    .join("");

  const ident = identPacienteHTML(paciente.nome, [
    ...camposIdentPadrao({
      registro: limpo(paciente.registro) || "—",
      atendimento: atendimento !== undefined ? atendimento : paciente.atendimentoCodigo,
      convenio: limpo(paciente.convenio) || "—",
      plano: limpo(paciente.plano) || "—",
      dataAdmissao: limpo(paciente.dataAdmissao) || "—",
      nascimento: limpo(paciente.nascimento) || "—",
      idade: limpo(paciente.idade) || "—",
      sexo: limpo(paciente.sexo) || "—",
      nomeMae: limpo(paciente.nomeMae) || "—",
    }),
  ]);

  const html = montarDocumentoBase({
    titulo: titulo.toUpperCase(),
    clinica,
    pacienteNome: paciente.nome,
    identHTML: ident,
    corpoHTML: corpo || `<p class="corpo-lbl">Sem dados preenchidos.</p>`,
    rodapeHTML: rodapeAssinaturaProfissional(
      "Profissional de Enfermagem",
      "Assinatura e carimbo (COREN)",
    ),
    cssExtra: `
      .corpo { min-height: 260px; }
      .corpo .campo { border-bottom: 1px solid #e5e5e5; padding: 8px 0; }
      .corpo .k { display: block; text-transform: uppercase; font-size: 11px; color: #888; }
      .corpo .v { display: block; font-size: 14px; }`,
  });

  abrirImpressao(html, "Permita pop-ups para imprimir o documento.");
}

/** Modal read-only genérico: lista rótulo→valor de um documento. */
export function DetalheModal({
  open,
  onClose,
  titulo,
  campos,
}: {
  open: boolean;
  onClose: () => void;
  titulo: string;
  campos: CampoDetalhe[];
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titulo}
      className="max-w-xl"
      footer={
        <Button variant="outline" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <dl className="grid grid-cols-1 gap-3 text-sm">
        {campos.map((c) => (
          <div key={c.label}>
            <dt className="font-medium text-ink">{c.label}</dt>
            <dd className="text-muted">{c.value || "—"}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

/** Estado vazio elegante para listas/históricos sem dados. */
export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-muted-surface text-muted">
        {icon}
      </span>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {subtitle && <p className="max-w-md text-sm text-muted">{subtitle}</p>}
    </Card>
  );
}

/** Select de paciente reutilizado nos formulários do módulo. */
export function PacienteSelect({
  pacientes,
  value,
  onChange,
  id = "paciente",
}: {
  pacientes: OpcaoPaciente[];
  value: string;
  onChange: (id: string) => void;
  id?: string;
}) {
  return (
    <Select
      id={id}
      label="Paciente"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Selecione o paciente...</option>
      {pacientes.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nome}
        </option>
      ))}
    </Select>
  );
}
