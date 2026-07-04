"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScrollText, Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/lib/store/confirm";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { cn } from "@/lib/utils";
import { emitirReceituario, removerReceituario } from "@/lib/actions/receituario";
import type { Receituario } from "@/lib/data/receituario";
import {
  imprimirReceituarioSimples,
  type ClinicaImpressao,
  type PacienteImpressao,
} from "./ReceituarioSimplesImpressao";
import {
  imprimirReceituarioEspecial,
  type PacienteImpressaoEspecial,
} from "./ReceituarioEspecialImpressao";

type Tipo = "simples" | "especial";

type Endereco = {
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
};

const PLACEHOLDER: Record<Tipo, string> = {
  simples:
    "Digite a prescrição livre — medicamentos, posologia, orientações...\nUma linha por item.",
  especial:
    "Digite a prescrição do medicamento sujeito a controle especial (Portaria 344/98)...\nUma linha por item.",
};

export function ReceituarioClient({
  patientId,
  clinica,
  paciente,
  endereco,
  receituarios,
}: {
  patientId: string;
  clinica: ClinicaImpressao;
  paciente: PacienteImpressao;
  endereco: Endereco;
  receituarios: Receituario[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [tipo, setTipo] = useState<Tipo>("simples");
  const [texto, setTexto] = useState("");

  const pacienteEspecial: PacienteImpressaoEspecial = {
    nome: paciente.nome,
    registro: paciente.registro,
    endereco: [endereco.endereco, endereco.bairro].filter(Boolean).join(", "),
    cidade: endereco.cidade,
    uf: endereco.uf,
    cep: endereco.cep,
  };

  /** Dispara a impressão do conteúdo conforme o tipo. */
  function imprimir(t: Tipo, conteudo: string) {
    if (t === "especial") {
      imprimirReceituarioEspecial(clinica, pacienteEspecial, conteudo);
    } else {
      imprimirReceituarioSimples(clinica, paciente, conteudo);
    }
  }

  function salvar() {
    const conteudo = texto.trim();
    if (!conteudo) {
      toast.error("Escreva a prescrição antes de salvar.");
      return;
    }
    startTransition(async () => {
      const res = await emitirReceituario({ patientId, tipo, texto: conteudo });
      if (res?.ok) {
        toast.success("Receituário emitido.");
        setTexto("");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível emitir o receituário.");
      }
    });
  }

  /** Imprime o texto atual do editor SEM exigir salvar (efêmero). */
  function imprimirAtual() {
    const conteudo = texto.trim();
    if (!conteudo) {
      toast.error("Escreva a prescrição antes de imprimir.");
      return;
    }
    imprimir(tipo, conteudo);
  }

  async function remover(id: string) {
    if (!(await confirm({ message: "Remover este receituário?", danger: true, confirmLabel: "Remover" }))) return;
    startTransition(async () => {
      const res = await removerReceituario(id);
      if (res?.ok) {
        toast.success("Receituário removido.");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível remover o receituário.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5">
        {/* Segmented control Simples | Especial */}
        <div
          role="tablist"
          aria-label="Tipo de receituário"
          className="mb-4 inline-flex rounded-lg border border-line bg-muted-surface p-1"
        >
          {(["simples", "especial"] as Tipo[]).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tipo === t}
              onClick={() => setTipo(t)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-100",
                tipo === t
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-muted hover:text-ink",
              )}
            >
              {t === "simples" ? "Simples" : "Especial"}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Prescrição</span>
          <textarea
            rows={12}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={PLACEHOLDER[tipo]}
            className="w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <p className="mt-2 text-xs text-muted">
          {tipo === "especial"
            ? "Modelo de controle especial (Portaria 344/98) — impresso em duas vias (farmácia e paciente)."
            : "Receituário simples — prescrição de texto livre."}
        </p>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={imprimirAtual}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Button onClick={salvar} disabled={pending}>
            <Save className="h-4 w-4" /> {pending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </Card>

      {receituarios.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-5 py-16 text-center">
          <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted-surface text-muted">
            <ScrollText className="h-7 w-7" />
          </span>
          <p className="font-medium text-ink">Nenhum receituário emitido</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            Os receituários emitidos para este paciente aparecerão aqui.
          </p>
        </Card>
      ) : (
        <Stagger className="flex flex-col gap-3">
          {receituarios.map((r) => (
            <FadeInUp key={r.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge status={r.tipo === "especial" ? "active" : "ok"}>
                        {r.tipo === "especial" ? "Controle Especial" : "Simples"}
                      </Badge>
                      <span className="text-xs text-muted">{r.dataHora}</span>
                    </div>
                    <p className="whitespace-pre-line break-words text-sm text-ink">
                      {r.texto}
                    </p>
                    <p className="mt-1 text-xs text-muted">{r.profissional}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => imprimir(r.tipo, r.texto)}
                    >
                      <Printer className="h-4 w-4" /> Imprimir
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remover(r.id)}
                      disabled={pending}
                    >
                      <Trash2 className="h-4 w-4" /> Remover
                    </Button>
                  </div>
                </div>
              </Card>
            </FadeInUp>
          ))}
        </Stagger>
      )}
    </div>
  );
}
