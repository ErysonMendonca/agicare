"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pill, HeartHandshake, CheckCircle2, Check, Clock } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { type Checagem } from "@/lib/clinico/prescricao-shared";
import { checarItem } from "@/lib/actions/prescricao";

export function ChecagemClient({
  patientId,
  checagens,
}: {
  patientId: string;
  checagens: Checagem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function checar(id: string) {
    startTransition(async () => {
      const res = await checarItem(id, patientId);
      if (res?.ok) {
        toast.success("Item checado.");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível checar o item.");
      }
    });
  }

  if (checagens.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center px-5 py-16 text-center">
        <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted-surface text-muted">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <p className="font-medium text-ink">Nenhum aprazamento pendente</p>
        <p className="mt-1 max-w-md text-sm text-muted">
          Os horários de checagem aparecem aqui quando uma prescrição com
          frequência é registrada.
        </p>
      </Card>
    );
  }

  const pendentes = checagens.filter((c) => c.status === "pendente").length;

  return (
    <>
      <p className="mb-4 text-sm text-muted">
        <span className="font-semibold text-ink">{pendentes}</span> aprazamento(s)
        pendente(s) de {checagens.length}.
      </p>

      <Stagger className="flex flex-col gap-3">
        {checagens.map((c) => {
          const checado = c.status === "checado";
          return (
            <FadeInUp key={c.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <span
                    className={
                      c.tipo === "medicamento"
                        ? "flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-50 text-brand-600"
                        : "flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-purple-50 text-purple-600"
                    }
                  >
                    {c.tipo === "medicamento" ? (
                      <Pill className="h-5 w-5" />
                    ) : (
                      <HeartHandshake className="h-5 w-5" />
                    )}
                  </span>
                  <div>
                    <p className="font-medium text-ink">{c.rotulo}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <Clock className="h-3.5 w-3.5" /> {c.horario} · {c.frequencia}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {checado ? (
                    <Badge status="ok">
                      <Check className="h-3 w-3" /> Checado
                      {c.checadoEm ? ` · ${c.checadoEm}` : ""}
                    </Badge>
                  ) : (
                    <>
                      <Badge status="warn">
                        <Clock className="h-3 w-3" /> Pendente
                      </Badge>
                      <Button size="sm" disabled={pending} onClick={() => checar(c.id)}>
                        <Check className="h-4 w-4" /> Checar
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            </FadeInUp>
          );
        })}
      </Stagger>
    </>
  );
}
