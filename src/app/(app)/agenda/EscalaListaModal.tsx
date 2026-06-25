"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Pencil, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { type Escala } from "@/lib/data/schedules";

const DIAS_LABEL: Record<number, string> = {
  0: "Dom",
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
};

const DIAS_LABEL_LONGO: Record<number, string> = {
  0: "domingo",
  1: "segunda-feira",
  2: "terça-feira",
  3: "quarta-feira",
  4: "quinta-feira",
  5: "sexta-feira",
  6: "sábado",
};

/** Resumo legível dos dias da semana (ordem Seg→Dom). */
function resumoDias(weekdays: number[]): string {
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  return ordem
    .filter((d) => weekdays.includes(d))
    .map((d) => DIAS_LABEL[d])
    .join(", ");
}

/**
 * Dia da semana (0=Dom … 6=Sáb) de uma data `YYYY-MM-DD` no fuso LOCAL.
 * (A escala é recorrente por dia da semana — não tem data própria — então
 * filtrar "por data" significa mostrar as escalas que atendem naquele dia.)
 * Parse manual evita o bug de `new Date("YYYY-MM-DD")` ser interpretado em UTC.
 */
function weekdayOf(dateStr: string): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getDay();
}

/**
 * Listagem de escalas com filtro por especialidade e profissional.
 * Cada linha tem um botão Editar que delega ao pai (abre o modal de edição).
 */
export function EscalaListaModal({
  open,
  onClose,
  escalas,
  onNova,
  onEditar,
}: {
  open: boolean;
  onClose: () => void;
  escalas: Escala[];
  onNova: () => void;
  onEditar: (escala: Escala) => void;
}) {
  const [especialidade, setEspecialidade] = useState("");
  const [data, setData] = useState("");
  const [busca, setBusca] = useState("");

  const especialidades = useMemo(
    () =>
      Array.from(
        new Set(escalas.map((e) => e.specialty).filter(Boolean)),
      ).sort(),
    [escalas],
  );

  const termo = busca.trim().toLowerCase();
  const diaSemana = weekdayOf(data);

  const filtradas = useMemo(
    () =>
      escalas.filter((e) => {
        const casaEspec = !especialidade || e.specialty === especialidade;
        const casaData = diaSemana === null || e.weekdays.includes(diaSemana);
        const casaTexto =
          termo === "" ||
          e.description.toLowerCase().includes(termo) ||
          e.specialty.toLowerCase().includes(termo);
        return casaEspec && casaData && casaTexto;
      }),
    [escalas, especialidade, diaSemana, termo],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Escalas de Horários"
      subtitle="Visualize e edite as grades de atendimento da clínica"
      className="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="primary" onClick={onNova}>
            <Plus className="h-4 w-4" />
            Nova Escala
          </Button>
        </>
      }
    >
      {/* Filtros */}
      <div className="mb-4 space-y-3">
        <Input
          id="escala-busca"
          type="search"
          label="Buscar"
          placeholder="Buscar por descrição ou especialidade..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Especialidade"
            value={especialidade}
            onChange={(e) => setEspecialidade(e.target.value)}
          >
            <option value="">Todas as especialidades</option>
            {especialidades.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </Select>
          <Input
            id="escala-data"
            type="date"
            label="Data"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
        {diaSemana !== null && (
          <p className="text-xs text-muted">
            Mostrando as escalas que atendem na {DIAS_LABEL_LONGO[diaSemana]}.{" "}
            <button
              type="button"
              onClick={() => setData("")}
              className="font-medium text-brand-500 hover:underline"
            >
              Limpar data
            </button>
          </p>
        )}
      </div>

      {filtradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-12 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
            <CalendarRange className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm text-muted">
            Nenhuma escala encontrada para o filtro selecionado.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtradas.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink">
                    {e.description}
                  </span>
                  {!e.active && <Badge status="danger">Inativa</Badge>}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {[e.specialty, e.professionalNome].filter(Boolean).join(" · ") ||
                    "Sem especialidade"}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {resumoDias(e.weekdays) || "Sem dias"} · {e.startTime}–{e.endTime}{" "}
                  · {e.slotMinutes} min
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEditar(e)}
                aria-label={`Editar escala ${e.description}`}
              >
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
