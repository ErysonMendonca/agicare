import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { type Identificacao } from "@/lib/data/prontuario";

/** Cabeçalho de identificação do paciente, reutilizado nas seções clínicas. */
export function PacienteCard({ id }: { id: Identificacao }) {
  return (
    <Card className="mb-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-brand-500 text-lg font-bold text-white">
            {id.nome.charAt(0)}
          </span>
          <div>
            <h2 className="font-semibold text-ink">{id.nome}</h2>
            <p className="text-sm text-muted">
              {id.atendimentoCodigo ? `Atendimento ${id.atendimentoCodigo} · ` : ""}
              CPF {id.cpf} · Nasc. {id.nascimento} · {id.idade} · {id.genero} · Mãe:{" "}
              {id.nomeMae} · {id.convenio}
            </p>
          </div>
        </div>
        <Badge status="active">Atendimento em andamento</Badge>
      </div>
    </Card>
  );
}
