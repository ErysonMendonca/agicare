import {
  LayoutDashboard,
  ListChecks,
  Users,
  CalendarDays,
  FileText,
  Stethoscope,
  FlaskConical,
  UserCog,
  Boxes,
  ClipboardList,
  Receipt,
  BarChart3,
  Settings,
  ShieldCheck,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import type { ModuleSlug } from "@/lib/permissions.shared";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Módulo de permissão associado à rota (1:1 com o slug). */
  module: ModuleSlug;
  badge?: number;
  /** Só aparece para gestor (papel admin). Mantido por compat; o filtro
   * principal do menu passou a ser `permissions[module].canView`. */
  gestorOnly?: boolean;
  /** Não exibe o contador dinâmico/badge — usado em entradas que repetem um
   * módulo em outro grupo (ex.: Estoque, que aparece em Operacional e Gestão)
   * para não duplicar a contagem de críticos. */
  hideCounter?: boolean;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

/** Menu agrupado: Operacional e Gestão. Estoque aparece nos dois grupos
 * (operacional com o badge de críticos; em Gestão como atalho, sem badge). */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Operacional",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, module: "dashboard" },
      { label: "Fila de Atendimento", href: "/fila", icon: ListChecks, badge: 6, module: "fila" },
      { label: "Pacientes", href: "/pacientes", icon: Users, module: "pacientes" },
      { label: "Agenda", href: "/agenda", icon: CalendarDays, module: "agenda" },
      { label: "Prontuário", href: "/prontuario", icon: FileText, module: "prontuario" },
      { label: "Procedimentos", href: "/procedimentos", icon: Stethoscope, module: "procedimentos" },
      { label: "Laboratório", href: "/laboratorio", icon: FlaskConical, module: "laboratorio" },
      { label: "Estoque", href: "/estoque", icon: Boxes, badge: 3, module: "estoque" },
      { label: "Solicitações", href: "/solicitacoes", icon: ClipboardList, module: "solicitacoes" },
    ],
  },
  {
    title: "Gestão",
    items: [
      { label: "Profissionais", href: "/profissionais", icon: UserCog, module: "profissionais" },
      { label: "Estoque", href: "/estoque", icon: Boxes, module: "estoque", hideCounter: true },
      { label: "Faturamento", href: "/faturamento", icon: Receipt, module: "faturamento" },
      { label: "Relatórios", href: "/relatorios", icon: BarChart3, module: "relatorios" },
      { label: "Configurações", href: "/configuracoes", icon: Settings, module: "configuracoes" },
      { label: "Perfis de Acesso", href: "/permissoes", icon: ShieldCheck, module: "permissoes" },
      { label: "Usuários", href: "/usuarios", icon: Users, module: "usuarios" },
      { label: "Logs / Auditoria", href: "/logs", icon: ScrollText, module: "logs" },
    ],
  },
];
