"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Pencil, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { type Profissional } from "@/lib/data/professionals";
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

/** Resumo legível dos dias da semana (ordem Seg→Dom). */
function resumoDias(weekdays: number[]): string {
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  return ordem
    .filter((d) => weekdays.includes(d))
    .map((d) => DIAS_LABEL[d])
    .join(", ");
}

/**
 * Listagem de escalas com filtro por especialidade e profissional.
 * Cada linha tem um botão Editar que delega ao pai (abre o modal de edição).
 */
export function EscalaListaModal({
  open,
  onClose,
  escalas,
  profissionais,
  onNova,
  onEditar,
}: {
  open: boolean;
  onClose: () => void;
  escalas: Escala[];
  profissionais: Profissional[];
  onNova: () => void;
  onEditar: (escala: Escala) => void;
}) {
  const [especialidade, setEspecialidade] = useState("");
  const [profissionalId, setProfissionalId] = useState("");

  const especialidades = useMemo(
    () =>
      Array.from(
        new Set(escalas.map((e) => e.specialty).filter(Boolean)),
      ).sort(),
    [escalas],
  );

  const filtradas = useMemo(
    () =>
      escalas.filter(
        (e) =>
          (!especialidade || e.specialty === especialidade) &&
          (!profissionalId || e.professionalId === profissionalId),
      ),
    [escalas, especialidade, profissionalId],
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
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        <Select
          label="Profissional"
          value={profissionalId}
          onChange={(e) => setProfissionalId(e.target.value)}
        >
          <option value="">Todos os profissionais</option>
          {profissionais.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </Select>
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
