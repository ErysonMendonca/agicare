"use client";

import { useServerInsertedHTML } from "next/navigation";

/**
 * Script bloqueante injetado no HTML do servidor (cabeçalho) para evitar
 * o flash do tema antes da hidratação do React.
 * Usa useServerInsertedHTML para injetar a tag fora da árvore de componentes
 * do cliente, evitando avisos do React 19.
 */
export function ThemeScript({ mode }: { mode: string }) {
  const js =
    `(function(){try{var m=${JSON.stringify(mode)};` +
    `var d=m==='escuro'||(m==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);` +
    `document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

  useServerInsertedHTML(() => (
    <script
      id="theme-script"
      dangerouslySetInnerHTML={{ __html: js }}
    />
  ));

  return null;
}
