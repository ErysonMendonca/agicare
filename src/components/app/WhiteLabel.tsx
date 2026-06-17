import type { BrandingSettings } from "@/lib/data/settings";

/**
 * White-label — peças server-side (sem estado): injeção de tema e paleta.
 *
 * São Server Components puros (renderizam apenas <script>/<style>), então NÃO
 * levam "use client" — rodam no servidor e fazem parte do HTML inicial, o que
 * elimina o flash de tema errado (FOUC) antes da hidratação do React.
 */

/** Cores padrão do tema (devem casar com os tokens hardcoded do globals.css). */
const DEFAULT_PRIMARY = "#0db8c2"; // teal — brand-500 / primary-medium
const DEFAULT_ACCENT = "#0be0ae"; // verde — accent / primary

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const isHex = (v: string): boolean => HEX.test(v);
const eq = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * Script bloqueante (1ª coisa no <body>) que aplica a classe `.dark` no <html>
 * ANTES do paint, conforme o modo salvo — evita flash de tema claro/escuro.
 * Em "auto", resolve via prefers-color-scheme. O ThemeProvider reconcilia depois.
 */
export function ThemeScript({ mode }: { mode: string }) {
  const js =
    `(function(){try{var m=${JSON.stringify(mode)};` +
    `var d=m==='escuro'||(m==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);` +
    `document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

/**
 * Injeta as CSS custom properties da PALETA (cor primária/destaque por hex) em
 * runtime, a partir do clinic_settings. Só emite overrides quando a cor difere
 * do default — assim o tema teal padrão continua PIXEL-PERFECT (usa os tokens
 * hardcoded do @theme). Para a primária, deriva a escala 50–900 via color-mix.
 */
export function BrandVars({ branding }: { branding: BrandingSettings }) {
  const primary = isHex(branding.primaryColor) ? branding.primaryColor : DEFAULT_PRIMARY;
  const accent = isHex(branding.accentColor) ? branding.accentColor : DEFAULT_ACCENT;

  const primaryCustom = !eq(primary, DEFAULT_PRIMARY);
  const accentCustom = !eq(accent, DEFAULT_ACCENT);

  const rules: string[] = [];

  if (primaryCustom) {
    // Escala derivada por color-mix (clareia com white, escurece com black).
    rules.push(
      `--color-brand-50:color-mix(in srgb, ${primary}, white 92%);`,
      `--color-brand-100:color-mix(in srgb, ${primary}, white 84%);`,
      `--color-brand-200:color-mix(in srgb, ${primary}, white 72%);`,
      `--color-brand-300:color-mix(in srgb, ${primary}, white 52%);`,
      `--color-brand-400:color-mix(in srgb, ${primary}, white 28%);`,
      `--color-brand-500:${primary};`,
      `--color-brand-600:color-mix(in srgb, ${primary}, black 14%);`,
      `--color-brand-700:color-mix(in srgb, ${primary}, black 28%);`,
      `--color-brand-800:color-mix(in srgb, ${primary}, black 42%);`,
      `--color-brand-900:color-mix(in srgb, ${primary}, black 52%);`,
      `--color-primary-medium:${primary};`,
      `--color-status-active:${primary};`,
    );
  }

  if (accentCustom) {
    rules.push(
      `--color-accent:${accent};`,
      `--color-primary:${accent};`,
      `--color-status-ok:${accent};`,
    );
  }

  if (primaryCustom || accentCustom) {
    rules.push(
      `--brand-gradient:linear-gradient(135deg, ${primary} 0%, ` +
        `color-mix(in srgb, ${primary}, ${accent}) 50%, ${accent} 100%);`,
    );
  }

  if (rules.length === 0) return null;

  return <style dangerouslySetInnerHTML={{ __html: `:root{${rules.join("")}}` }} />;
}
