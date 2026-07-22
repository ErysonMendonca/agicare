"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Stethoscope,
  Syringe,
  Pill,
  ClipboardList,
  FileText,
  Bone,
  HeartPulse,
  ScrollText,
  History,
  Smile,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Sub-navegação do prontuário clínico de um paciente. */
export function ClinicoNav({ patientId, userRole }: { patientId: string; userRole?: string | null }) {
  const pathname = usePathname();
  const base = `/prontuario/${patientId}`;

  const isMedico = userRole === "medico" || userRole === "admin";
  const isEnfermagem =
    userRole === "enfermeiro" || userRole === "tecnico_enfermagem";

  const tabs = [
    { href: base, label: "Resumo", icon: Activity, exact: true },
    { href: `${base}/anamnese`, label: "Anamnese", icon: ClipboardList },
    { href: `${base}/evolucao`, label: "Evolução", icon: Stethoscope },
    { href: `${base}/procedimento`, label: "Procedimento", icon: Syringe },
    { href: `${base}/protetico`, label: "Protético", icon: Bone },
    { href: `${base}/ortograma`, label: "Ortograma", icon: Smile },
    { href: `${base}/receituario`, label: "Receituário", icon: ScrollText },
    { href: `${base}/documentos`, label: "Alta / Atestado", icon: FileText },
    { href: `${base}/historico`, label: "Histórico", icon: History },
  ];

  // Âncora estável: inserir logo após "Protético" (a lista cresce com o tempo).
  const depoisDoProtetico = () =>
    tabs.findIndex((t) => t.href === `${base}/protetico`) + 1;

  // Prescrição: ato médico → visível para médico/admin.
  if (isMedico) {
    tabs.splice(depoisDoProtetico(), 0, {
      href: `${base}/prescricao`,
      label: "Prescrição",
      icon: Pill,
    });
  }

  // Enfermagem: equipe de enfermagem + médico/admin (para visualizar os registros).
  if (isEnfermagem || isMedico) {
    tabs.splice(depoisDoProtetico(), 0, {
      href: `${base}/enfermagem`,
      label: "Enfermagem",
      icon: HeartPulse,
    });
  }

  return (
    <nav className="mb-6 flex flex-wrap gap-2">
      {tabs.map((t) => {
        const ativo = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              ativo
                ? "bg-brand-500 text-white"
                : "text-muted hover:bg-black/5 hover:text-ink",
            )}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
