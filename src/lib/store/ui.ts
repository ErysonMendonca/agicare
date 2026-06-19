import { create } from "zustand";

/**
 * Estado de UI compartilhado no client (sem persistência).
 * Hoje guarda só o recolher/expandir da sidebar — usado por Topbar (botão)
 * e Sidebar (largura animada) sem precisar de provider.
 */
interface UIState {
  /** Sidebar recolhida (escondida) quando true. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
}));
