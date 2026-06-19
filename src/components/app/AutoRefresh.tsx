"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Atualização automática (polling) sem refresh manual.
 *
 * Chama `router.refresh()` em intervalo, o que **re-executa os Server Components
 * da rota atual e re-busca os dados no servidor**, atualizando a tela no lugar —
 * sem F5, sem recarregar a página inteira e sem perder estado de cliente
 * (inputs preenchidos, modal aberto, scroll). Assim, quem está apenas olhando a
 * página vê as mudanças aparecerem sozinhas.
 *
 * - Pausa quando a aba está OCULTA (não desperdiça requisições em background).
 * - Atualiza imediatamente ao a aba voltar a ficar visível.
 *
 * Montado uma única vez no layout do app → vale para todas as telas autenticadas.
 */
export function AutoRefresh({ intervalMs = 12000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };

    const id = setInterval(refreshIfVisible, intervalMs);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router, intervalMs]);

  return null;
}
