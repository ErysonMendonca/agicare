"use client";

import { useMemo, useState, useEffect } from "react";
import { CalendarRange, Pencil, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { type Escala } from "@/lib/data/schedules";
import { type AttendanceOption } from "@/lib/data/attendance-options.shared";

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
/** "YYYY-MM-DD" → "dd/MM/yyyy" (vazio → ""). */
function fmtData(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
}

/** Resumo da vigência (data inicial/final) da escala. */
function resumoVigencia(startDate: string, endDate: string): string {
  const ini = fmtData(startDate);
  const fim = fmtData(endDate);
  if (!ini && !fim) return "Sem período definido";
  return `${ini || "—"} até ${fim || "—"}`;
}

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
  especialidades: catalogoEspecialidades,
  onNova,
  onEditar,
}: {
  open: boolean;
  onClose: () => void;
  escalas: Escala[];
  /** Catálogo de especialidades (attendance_options), fonte única do sistema. */
  especialidades: AttendanceOption[];
  onNova: () => void;
  onEditar: (escala: Escala) => void;
}) {
  const [especialidade, setEspecialidade] = useState("");
  const [data, setData] = useState("");
  const [busca, setBusca] = useState("");

  // Opções do catálogo + as já presentes nas escalas (legado), sem duplicar.
  const especialidades = useMemo(() => {
    const opts = catalogoEspecialidades.map((e) => ({
      value: e.value,
      label: e.label,
    }));
    const seen = new Set(opts.map((o) => o.value));
    for (const e of escalas) {
      if (e.specialty && !seen.has(e.specialty)) {
        seen.add(e.specialty);
        opts.push({ value: e.specialty, label: e.specialty });
      }
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [catalogoEspecialidades, escalas]);

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

  const POR_PAGINA = 3;
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const inicio = (paginaSegura - 1) * POR_PAGINA;
  const visiveis = filtradas.slice(inicio, inicio + POR_PAGINA);

  useEffect(() => {
    setPagina(1);
  }, [busca, especialidade, data]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Escalas de Horários"
      subtitle="Visualize e edite as grades de atendimento da clínica"
      className="max-w-5xl"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {/* Filtros */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-col">
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="escala-busca" className="text-sm font-medium text-ink">
              Buscar
            </label>
            <Button variant="primary" size="sm" onClick={onNova}>
              <Plus className="h-4 w-4" />
              Nova Escala
            </Button>
          </div>
          <Input
            id="escala-busca"
            type="search"
            placeholder="Buscar por descrição ou especialidade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Especialidade"
            value={especialidade}
            onChange={(e) => setEspecialidade(e.target.value)}
          >
            <option value="">Todas as especialidades</option>
            {especialidades.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
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
        <>
          <ul className="space-y-2">
            {visiveis.map((e) => (
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
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                    <CalendarRange className="h-3.5 w-3.5 shrink-0" />
                    Vigência: {resumoVigencia(e.startDate, e.endDate)}
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
          {filtradas.length > 0 && (
            <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-xs text-muted">
                Mostrando {inicio + 1} a{" "}
                {Math.min(inicio + POR_PAGINA, filtradas.length)} de{" "}
                {filtradas.length} {filtradas.length === 1 ? "escala" : "escalas"}
              </p>
              {totalPaginas > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    disabled={paginaSegura === 1}
                    aria-label="Página anterior"
                    className="rounded-lg border border-line p-2 text-muted transition-colors hover:bg-muted-surface disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPagina(n)}
                      aria-label={`Página ${n}`}
                      aria-current={n === paginaSegura ? "page" : undefined}
                      className={
                        n === paginaSegura
                          ? "h-9 min-w-9 rounded-lg bg-brand-500 px-2 text-sm font-medium text-white"
                          : "h-9 min-w-9 rounded-lg border border-line px-2 text-sm font-medium text-muted transition-colors hover:bg-muted-surface hover:text-ink"
                      }
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                    disabled={paginaSegura === totalPaginas}
                    aria-label="Próxima página"
                    className="rounded-lg border border-line p-2 text-muted transition-colors hover:bg-muted-surface disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
