import { create } from "zustand";

// ════════════════════════════════════════════════════════════════
// Confirmação global (substitui o window.confirm nativo por um modal
// estilizado). Uso nos componentes:
//
//   const confirm = useConfirm();
//   if (!(await confirm({ message: "Remover?", danger: true }))) return;
//
// O <ConfirmDialog /> é montado UMA vez no layout do app e lê este store.
// Baseado em Promise: `confirm(...)` resolve true (confirmou) ou false
// (cancelou/fechou). Sem provider — mesmo padrão do useUIStore.
// ════════════════════════════════════════════════════════════════

export type ConfirmOptions = {
  /** Título do modal. Default: "Confirmar". */
  title?: string;
  /** Texto principal (a pergunta). */
  message: string;
  /** Rótulo do botão de confirmação. Default: "Confirmar". */
  confirmLabel?: string;
  /** Rótulo do botão de cancelar. Default: "Cancelar". */
  cancelLabel?: string;
  /** Botão de confirmação em vermelho (ação destrutiva). */
  danger?: boolean;
};

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  /** Resolver da Promise pendente (interno). */
  resolver: ((value: boolean) => void) | null;
  /** Abre o modal e devolve uma Promise que resolve na escolha do usuário. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Fecha resolvendo a Promise (interno, chamado pelos botões do modal). */
  close: (value: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolver: null,
  confirm: (options) =>
    new Promise<boolean>((resolve) => {
      // Se já houver um confirm aberto, cancela o anterior (evita resolver órfão).
      const anterior = get().resolver;
      if (anterior) anterior(false);
      set({ open: true, options, resolver: resolve });
    }),
  close: (value) => {
    get().resolver?.(value);
    set({ open: false, options: null, resolver: null });
  },
}));

/** Hook ergonômico: `const confirm = useConfirm();` → `await confirm({...})`. */
export function useConfirm() {
  return useConfirmStore((s) => s.confirm);
}
