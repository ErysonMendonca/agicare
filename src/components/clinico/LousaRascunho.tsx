"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import Image from "next/image";
import {
  Eraser,
  ImagePlus,
  Pencil,
  Save,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { salvarLousa } from "@/lib/actions/anamnese-files";
import type { AnamneseLousa } from "@/lib/data/anamnese-files";

export interface LousaRascunhoProps {
  patientId: string;
  /** Rascunhos já salvos (vêm de listLousas no server). */
  lousas?: AnamneseLousa[];
  /** Recarrega a lista após salvar (ex.: router.refresh). */
  onSaved?: () => void;
  className?: string;
}

const CORES = [
  { label: "Tinta", value: "#1c1c1e" },
  { label: "Vermelho", value: "#dc2626" },
  { label: "Azul", value: "#2563eb" },
  { label: "Verde", value: "#16a34a" },
];
const ESPESSURAS = [2, 4, 8];

/**
 * Lousa de rascunho clínico: sobe uma imagem de fundo e desenha por cima
 * (mouse/caneta/toque). Exporta o PNG composto (fundo + traços) e salva via
 * salvarLousa. Técnica de canvas/ponteiro herdada do SignaturePad.
 */
export function LousaRascunho({
  patientId,
  lousas = [],
  onSaved,
  className,
}: LousaRascunhoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const bgRef = useRef<HTMLImageElement | null>(null);
  /** Pilha de estados (dataURL) para desfazer. */
  const history = useRef<string[]>([]);

  const [color, setColor] = useState(CORES[0].value);
  const [width, setWidth] = useState(ESPESSURAS[1]);
  const [hasContent, setHasContent] = useState(false);
  const [note, setNote] = useState("");
  const [saving, startSaving] = useTransition();

  // Configura resolução conforme tamanho real + devicePixelRatio.
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  // Redesenha o fundo (imagem) cobrindo o canvas, mantendo proporção (contain).
  const drawBackground = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const img = bgRef.current;
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!img) return;
    const scale = Math.min(rect.width / img.width, rect.height / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (rect.width - w) / 2, (rect.height - h) / 2, w, h);
  }, []);

  useEffect(() => {
    setupCanvas();
    const onResize = () => {
      const snapshot = hasContent
        ? canvasRef.current?.toDataURL("image/png")
        : null;
      setupCanvas();
      if (snapshot) restore(snapshot);
      else drawBackground();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function restore(dataUrl: string) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const img = document.createElement("img");
    img.onload = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
    };
    img.src = dataUrl;
  }

  function pushHistory() {
    const url = canvasRef.current?.toDataURL("image/png");
    if (url) {
      history.current.push(url);
      if (history.current.length > 20) history.current.shift();
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = document.createElement("img");
      img.onload = () => {
        bgRef.current = img;
        history.current = [];
        drawBackground();
        setHasContent(true);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    pushHistory();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPoint.current = pointFrom(e);
  }

  function handleMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    const p = pointFrom(e);
    const prev = lastPoint.current;
    if (!ctx || !prev) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPoint.current = p;
    setHasContent(true);
  }

  function handleUp() {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
  }

  function undo() {
    const prev = history.current.pop();
    if (prev) restore(prev);
    else {
      drawBackground();
      setHasContent(!!bgRef.current);
    }
  }

  function clearAll() {
    bgRef.current = null;
    history.current = [];
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
    }
    setHasContent(false);
  }

  function salvar() {
    const dataUrl = canvasRef.current?.toDataURL("image/png");
    if (!dataUrl || !hasContent) {
      toast.error("Desenhe ou suba uma imagem antes de salvar.");
      return;
    }
    startSaving(async () => {
      try {
        const res = await salvarLousa({
          patientId,
          dataUrl,
          note: note.trim() || undefined,
        });
        if (res?.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Rascunho salvo no prontuário.");
        setNote("");
        clearAll();
        onSaved?.();
      } catch {
        toast.error("Não foi possível salvar o rascunho.");
      }
    });
  }

  return (
    <Card className={cn("p-4", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <Pencil className="h-4 w-4 text-brand-600" /> Lousa / Rascunho
        </h3>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-muted-surface focus-within:ring-2 focus-within:ring-brand-500">
          <ImagePlus className="h-4 w-4 text-muted" />
          Imagem de fundo
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleFile}
            aria-label="Subir imagem de fundo para a lousa"
          />
        </label>
      </div>

      {/* Ferramentas */}
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5" role="group" aria-label="Cor do traço">
          {CORES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              aria-label={c.label}
              aria-pressed={color === c.value}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition",
                color === c.value
                  ? "border-ink scale-110"
                  : "border-line",
              )}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Espessura do traço">
          {ESPESSURAS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWidth(w)}
              aria-label={`Espessura ${w}`}
              aria-pressed={width === w}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md border text-muted transition",
                width === w
                  ? "border-brand-500 bg-brand-50 text-brand-600"
                  : "border-line hover:bg-muted-surface",
              )}
            >
              <span
                className="rounded-full bg-current"
                style={{ width: w + 2, height: w + 2 }}
              />
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={undo} disabled={!hasContent}>
            <Undo2 className="h-4 w-4" /> Desfazer
          </Button>
          <Button size="sm" variant="outline" onClick={clearAll} disabled={!hasContent}>
            <Eraser className="h-4 w-4" /> Limpar
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative overflow-hidden rounded-lg border border-line bg-white">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Lousa de rascunho — desenhe com mouse, caneta ou toque"
          className="h-[360px] w-full touch-none cursor-crosshair"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
          onPointerCancel={handleUp}
        />
        {!hasContent && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted">
            Suba uma imagem de fundo (opcional) e desenhe por cima
          </span>
        )}
      </div>

      {/* Nota + salvar */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm">
          <span className="mb-1 block font-medium text-ink">Observação (opcional)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex.: marcação da lesão no antebraço direito"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>
        <Button onClick={salvar} disabled={saving || !hasContent}>
          <Save className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar rascunho"}
        </Button>
      </div>

      {/* Galeria de rascunhos salvos */}
      {lousas.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Rascunhos salvos ({lousas.length})
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {lousas.map((l) => {
              const legenda = l.note || l.criadoEm;
              const conteudo = (
                <>
                  <span className="relative block aspect-[4/3] bg-muted-surface">
                    {l.url ? (
                      <Image
                        src={l.url}
                        alt={l.note || "Rascunho clínico"}
                        fill
                        sizes="200px"
                        className="object-contain transition group-hover:scale-[1.02]"
                        unoptimized
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-[11px] text-muted">
                        Imagem indisponível
                      </span>
                    )}
                  </span>
                  {legenda && (
                    <span className="block truncate px-2 py-1 text-[11px] text-muted">
                      {legenda}
                    </span>
                  )}
                </>
              );
              return (
                <li key={l.id}>
                  {l.url ? (
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block overflow-hidden rounded-lg border border-line focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {conteudo}
                    </a>
                  ) : (
                    <div className="group block overflow-hidden rounded-lg border border-line">
                      {conteudo}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
