"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Eraser, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SignaturePadProps {
  /** Rótulo acessível exibido acima do pad. */
  label?: string;
  /** dataURL atual (base64). String vazia = sem assinatura. */
  value?: string;
  /** Disparado ao terminar um traço ou ao limpar (dataURL ou ""). */
  onChange?: (dataUrl: string) => void;
  /** Marca o campo como obrigatório (apenas visual). */
  required?: boolean;
  /** Desabilita o desenho (modo somente leitura). */
  disabled?: boolean;
  className?: string;
  /** Altura útil do pad em px. */
  height?: number;
}

/**
 * Pad de assinatura à mão livre (mouse/caneta/touch) sobre <canvas>.
 * Exporta a assinatura como dataURL PNG via `onChange`. Sem dependência externa.
 */
export function SignaturePad({
  label = "Assinatura",
  value,
  onChange,
  required,
  disabled,
  className,
  height = 160,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInkState] = useState(false);
  // Espelho em ref: o handler de resize (deps []) precisa ler o valor ATUAL,
  // senão o closure congela em `false` e apaga a assinatura ao redimensionar.
  const hasInkRef = useRef(false);
  const setHasInk = useCallback((v: boolean) => {
    hasInkRef.current = v;
    setHasInkState(v);
  }, []);

  // Configura resolução do canvas conforme o tamanho real e o devicePixelRatio.
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
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1c1c1e"; // --color-ink
  }, []);

  // Restaura uma assinatura já salva (preview ao reabrir).
  const drawFromDataUrl = useCallback((dataUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas || !dataUrl) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
      setHasInk(true);
    };
    img.src = dataUrl;
  }, [setHasInk]);

  useEffect(() => {
    setupCanvas();
    if (value) drawFromDataUrl(value);
    // Reconfigura ao redimensionar a janela (mantém a assinatura atual).
    const onResize = () => {
      const current = hasInkRef.current
        ? canvasRef.current?.toDataURL("image/png")
        : "";
      setupCanvas();
      if (current) drawFromDataUrl(current);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPoint.current = pointFrom(e);
  }

  function handleMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    const p = pointFrom(e);
    const prev = lastPoint.current;
    if (!ctx || !prev) return;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPoint.current = p;
    if (!hasInk) setHasInk(true);
  }

  function handleUp() {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    const dataUrl = hasInk ? canvasRef.current?.toDataURL("image/png") ?? "" : "";
    onChange?.(dataUrl);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
    }
    setHasInk(false);
    onChange?.("");
  }

  return (
    <div className={cn("block", className)}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <Pencil className="h-3.5 w-3.5 text-muted" />
          {label}
          {required && <span className="text-red-500">*</span>}
        </span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasInk}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-muted-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Eraser className="h-3.5 w-3.5" /> Limpar
        </button>
      </div>

      <div
        className={cn(
          "relative overflow-hidden rounded-lg border bg-white",
          hasInk ? "border-line" : "border-dashed border-line",
        )}
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={
            hasInk ? `${label} preenchida` : `${label} — desenhe para assinar`
          }
          className="h-full w-full touch-none cursor-crosshair"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
          onPointerCancel={handleUp}
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted">
            Assine no quadro acima (mouse, caneta ou toque)
          </span>
        )}
      </div>
    </div>
  );
}
