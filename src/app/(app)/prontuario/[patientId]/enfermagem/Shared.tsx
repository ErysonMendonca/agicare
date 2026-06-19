"use client";

import { type ReactNode } from "react";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { type OpcaoPaciente } from "@/lib/data/enfermagem";

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
