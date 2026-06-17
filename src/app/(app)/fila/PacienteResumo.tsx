import { type FilaItem } from "@/lib/data/queue";

/** Card cinza de resumo do paciente, usado nos modais de Ações e Desistência. */
export function PacienteResumo({ item }: { item: FilaItem }) {
  return (
    <div className="rounded-xl border border-line bg-muted-surface p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-brand-500 text-xs font-bold text-white">
          {item.codigo}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{item.paciente}</p>
          <p className="truncate text-sm text-muted">{item.convenio}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm text-muted">
        <span>
          Horário: <span className="font-semibold text-ink">{item.hora}</span>
        </span>
        <span>
          Especialidade:{" "}
          <span className="font-semibold text-ink">{item.especialidade}</span>
        </span>
      </div>
    </div>
  );
}
