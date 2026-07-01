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
  Check,
  Circle,
  Eraser,
  ImagePlus,
  Pencil,
  RectangleHorizontal,
  Save,
  Square,
  Triangle,
  Type,
  Undo2,
  X,
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
  /** Imagem de fundo pré-fixada (ex.: signed-URL de outro domínio). */
  backgroundUrl?: string;
  /**
   * Id estável do fundo (ex.: especialidade). A imagem só (re)carrega quando
   * ISTO muda — assim o refresh/polling que troca a signed-URL não limpa a lousa.
   */
  backgroundKey?: string;
  className?: string;
}

/** Ferramentas de desenho disponíveis na toolbar. */
type Ferramenta =
  | "livre"
  | "retangulo"
  | "quadrado"
  | "circulo"
  | "triangulo"
  | "texto";

const CORES = [
  { label: "Tinta", value: "#1c1c1e" },
  { label: "Vermelho", value: "#dc2626" },
  { label: "Azul", value: "#2563eb" },
  { label: "Verde", value: "#16a34a" },
];
const ESPESSURAS = [2, 4, 8];
const FERRAMENTAS = [
  { value: "livre", label: "Desenho livre", icon: Pencil },
  { value: "retangulo", label: "Retângulo", icon: RectangleHorizontal },
  { value: "quadrado", label: "Quadrado", icon: Square },
  { value: "circulo", label: "Círculo", icon: Circle },
  { value: "triangulo", label: "Triângulo", icon: Triangle },
  { value: "texto", label: "Texto", icon: Type },
] as const satisfies ReadonlyArray<{
  value: Ferramenta;
  label: string;
  icon: typeof Pencil;
}>;

/**
 * Lousa de rascunho clínico: sobe uma imagem de fundo e desenha por cima
 * (mouse/caneta/toque). Exporta o PNG composto (fundo + traços) e salva via
 * salvarLousa. Técnica de canvas/ponteiro herdada do SignaturePad.
 */
export function LousaRascunho({
  patientId,
  lousas = [],
  onSaved,
  backgroundUrl,
  backgroundKey,
  className,
}: LousaRascunhoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const bgRef = useRef<HTMLImageElement | null>(null);
  /** Origem do fundo atual: pré-fixado (template) ou upload manual do médico. */
  const bgSource = useRef<"prefixed" | "upload" | null>(null);
  /** URL de fundo atual — atualizada a cada render, lida dentro do efeito. */
  const urlRef = useRef<string | undefined>(backgroundUrl);
  urlRef.current = backgroundUrl;
  /** Pilha de estados (dataURL) para desfazer. */
  const history = useRef<string[]>([]);
  /** Ponto inicial do arrasto ao desenhar formas. */
  const startPoint = useRef<{ x: number; y: number } | null>(null);
  /** Snapshot (device pixels) do canvas para a prévia de forma. */
  const shapeSnapshot = useRef<ImageData | null>(null);

  const [color, setColor] = useState(CORES[0].value);
  const [width, setWidth] = useState(ESPESSURAS[1]);
  const [tool, setTool] = useState<Ferramenta>("livre");
  const [hasContent, setHasContent] = useState(false);
  /** True só quando o MÉDICO desenha/forma/texto (não pelo carregar o fundo). */
  const [desenhou, setDesenhou] = useState(false);
  const [note, setNote] = useState("");
  const [saving, startSaving] = useTransition();
  /** Rascunho da ferramenta de texto: posição do clique + valor digitado. */
  const [textDraft, setTextDraft] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [textValue, setTextValue] = useState("");

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
      let snapshot: string | undefined | null = null;
      if (hasContent) {
        try {
          snapshot = canvasRef.current?.toDataURL("image/png");
        } catch {
          // Canvas "tainted": não dá para snapshot — cai no redraw do fundo.
          snapshot = null;
        }
      }
      setupCanvas();
      if (snapshot) restore(snapshot);
      else drawBackground();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)carrega o fundo pré-fixado. Depende de `backgroundKey` (id estável), NÃO
  // da URL — assim o refresh/polling que só troca a signed-URL não limpa a lousa.
  // Usa crossOrigin='anonymous' para não "tainted" o canvas ao exportar o PNG.
  useEffect(() => {
    const url = urlRef.current;
    // Sem imagem para esta chave: limpa o fundo anterior e deixa em branco.
    if (!url) {
      bgRef.current = null;
      bgSource.current = null;
      history.current = [];
      drawBackground();
      setHasContent(false);
      setDesenhou(false);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      bgRef.current = img;
      bgSource.current = "prefixed";
      history.current = [];
      drawBackground();
      // Fundo carregado NÃO conta como conteúdo do médico (não habilita salvar).
      setHasContent(true);
      setDesenhou(false);
    };
    img.onerror = () => {
      // Falha (ex.: signed-URL sem CORS) → limpa e avisa o médico.
      bgRef.current = null;
      bgSource.current = null;
      drawBackground();
      setHasContent(false);
      toast.error("Não foi possível carregar a imagem de fundo da lousa.");
    };
    img.src = url;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundKey]);

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
    try {
      const url = canvasRef.current?.toDataURL("image/png");
      if (url) {
        history.current.push(url);
        if (history.current.length > 20) history.current.shift();
      }
    } catch {
      // Canvas "tainted": pula o snapshot de histórico sem travar o desenho.
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
        bgSource.current = "upload";
        history.current = [];
        drawBackground();
        setHasContent(true);
        setDesenhou(false);
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

  // Desenha o contorno da forma ativa do ponto inicial ao atual (sem preencher).
  function drawShape(
    ctx: CanvasRenderingContext2D,
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    if (tool === "circulo") {
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    } else if (tool === "triangulo") {
      // Isósceles apontando para cima: ápice no topo-centro, base embaixo.
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x);
      const top = Math.min(a.y, b.y);
      const bottom = Math.max(a.y, b.y);
      ctx.moveTo((left + right) / 2, top);
      ctx.lineTo(right, bottom);
      ctx.lineTo(left, bottom);
      ctx.closePath();
    } else {
      // Retângulo (bounding box livre) ou quadrado (lado igual).
      let w = b.x - a.x;
      let h = b.y - a.y;
      if (tool === "quadrado") {
        const lado = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * lado;
        h = Math.sign(h || 1) * lado;
      }
      ctx.rect(a.x, a.y, w, h);
    }
    ctx.stroke();
  }

  function handleDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();

    // Ferramenta de texto: clique abre um input inline na posição do clique.
    if (tool === "texto") {
      const p = pointFrom(e);
      setTextDraft(p);
      setTextValue("");
      return;
    }

    pushHistory();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = pointFrom(e);
    lastPoint.current = p;
    startPoint.current = p;

    // Para formas, guarda o snapshot atual (device pixels) para a prévia.
    if (tool !== "livre") {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        try {
          shapeSnapshot.current = ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          );
        } catch {
          // Canvas "tainted": sem snapshot → a prévia da forma fica sem base.
          shapeSnapshot.current = null;
        }
      }
    }
  }

  // Confirma o texto digitado no input inline: desenha com fillText e registra.
  function confirmarTexto() {
    const p = textDraft;
    const texto = textValue.trim();
    if (p && texto) {
      pushHistory();
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        const fontSize = Math.max(16, width * 6);
        ctx.fillStyle = color;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(texto, p.x, p.y);
        setHasContent(true);
        setDesenhou(true);
      }
    }
    setTextDraft(null);
    setTextValue("");
  }

  function cancelarTexto() {
    setTextDraft(null);
    setTextValue("");
  }

  function handleMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    const p = pointFrom(e);

    if (tool !== "livre") {
      const start = startPoint.current;
      if (!ctx || !start) return;
      // Restaura o snapshot e desenha a prévia da forma.
      if (shapeSnapshot.current) ctx.putImageData(shapeSnapshot.current, 0, 0);
      drawShape(ctx, start, p);
      return;
    }

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
    setDesenhou(true);
  }

  function handleUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;

    // Comita a forma no ponto final.
    if (tool !== "livre") {
      const ctx = canvasRef.current?.getContext("2d");
      const start = startPoint.current;
      const end = pointFrom(e);
      if (ctx && start) {
        if (shapeSnapshot.current) ctx.putImageData(shapeSnapshot.current, 0, 0);
        drawShape(ctx, start, end);
        setHasContent(true);
        setDesenhou(true);
      }
      shapeSnapshot.current = null;
    }

    lastPoint.current = null;
    startPoint.current = null;
  }

  function undo() {
    const prev = history.current.pop();
    if (prev) restore(prev);
    else {
      // Sem histórico: volta ao fundo puro (sem anotações do médico).
      drawBackground();
      setHasContent(!!bgRef.current);
      setDesenhou(false);
    }
  }

  function clearAll() {
    history.current = [];
    // Fundo pré-fixado (template) permanece; só o de upload manual é removido.
    if (bgSource.current === "upload") {
      bgRef.current = null;
      bgSource.current = null;
    }
    // Redesenha: apaga as anotações e recompõe o fundo pré-fixado, se houver.
    drawBackground();
    setDesenhou(false);
    setHasContent(!!bgRef.current);
  }

  function salvar() {
    if (!desenhou) {
      toast.error("Desenhe algo na lousa antes de salvar.");
      return;
    }
    let dataUrl: string | undefined;
    try {
      dataUrl = canvasRef.current?.toDataURL("image/png");
    } catch {
      // Canvas "tainted" (imagem de fundo de outro domínio sem CORS).
      toast.error(
        "Não foi possível exportar: a imagem de fundo bloqueou o salvamento (CORS).",
      );
      return;
    }
    if (!dataUrl) {
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
        <div className="flex items-center gap-1.5" role="group" aria-label="Ferramenta">
          {FERRAMENTAS.map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setTool(f.value)}
                aria-label={f.label}
                aria-pressed={tool === f.value}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md border transition",
                  tool === f.value
                    ? "border-brand-500 bg-brand-50 text-brand-600"
                    : "border-line text-muted hover:bg-muted-surface",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
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
        {!hasContent && !textDraft && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted">
            Suba uma imagem de fundo (opcional) e desenhe por cima
          </span>
        )}

        {/* Input inline da ferramenta de texto (na posição do clique) */}
        {textDraft && (
          <div
            className="absolute z-10 flex items-center gap-1 rounded-lg border border-line bg-white p-1 shadow-md"
            style={{
              left: Math.min(textDraft.x, 220),
              top: textDraft.y,
              maxWidth: "calc(100% - 12px)",
            }}
          >
            <input
              type="text"
              autoFocus
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmarTexto();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelarTexto();
                }
              }}
              placeholder="Digite o texto…"
              aria-label="Texto a inserir na lousa"
              className="w-40 rounded-md border border-line px-2 py-1 text-sm text-ink outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="button"
              onClick={confirmarTexto}
              aria-label="Confirmar texto"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-brand-500 bg-brand-50 text-brand-600 hover:bg-brand-100"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={cancelarTexto}
              aria-label="Cancelar texto"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-muted hover:bg-muted-surface"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
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
        <Button onClick={salvar} disabled={saving || !desenhou}>
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
