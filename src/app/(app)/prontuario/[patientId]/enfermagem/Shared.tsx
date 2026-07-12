"use client";

import { type ReactNode } from "react";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { type OpcaoPaciente } from "@/lib/data/enfermagem";

/** Par rótulo→valor exibido nos modais de visualização / impressão. */
export type CampoDetalhe = { label: string; value: string };

/** Impressão simples de um documento de enfermagem em uma janela nova. */
export function imprimirDocumento(titulo: string, campos: CampoDetalhe[]) {
  if (typeof window === "undefined") return;
  const win = window.open("", "_blank", "width=800,height=600");
  if (!win) return;
  const esc = (s: string) =>
    s.replace(
      /[&<>]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c,
    );
  const linhas = campos
    .filter((c) => c.value && c.value !== "—")
    .map((c) => `<dt>${esc(c.label)}</dt><dd>${esc(c.value)}</dd>`)
    .join("");
  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(titulo)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:40px;line-height:1.5}
  h1{font-size:20px;margin:0 0 24px}
  dt{font-weight:bold;margin-top:12px}
  dd{margin:0}
  hr{border:none;border-top:1px solid #ddd;margin:24px 0}
  .foot{margin-top:48px;font-size:12px;color:#777}
</style></head><body>
  <h1>${esc(titulo)}</h1>
  <dl>${linhas}</dl>
  <hr>
  <div class="foot">Documento gerado pelo sistema agicare.</div>
</body></html>`);
  win.document.close();
  win.focus();
  win.print();
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
