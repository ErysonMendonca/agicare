"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Stethoscope,
  Pill,
  CheckSquare,
  ClipboardList,
  FileText,
  Bone,
  HeartPulse,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Sub-navegação do prontuário clínico de um paciente. */
export function ClinicoNav({ patientId }: { patientId: string }) {
  const pathname = usePathname();
  const base = `/prontuario/${patientId}`;

  const tabs = [
    { href: base, label: "Resumo", icon: Activity, exact: true },
    { href: `${base}/anamnese`, label: "Anamnese", icon: ClipboardList },
    { href: `${base}/evolucao`, label: "Evolução", icon: Stethoscope },
    { href: `${base}/protetico`, label: "Protético", icon: Bone },
    { href: `${base}/prescricao`, label: "Prescrição", icon: Pill },
    { href: `${base}/checagem`, label: "Checagem", icon: CheckSquare },
    { href: `${base}/enfermagem`, label: "Enfermagem", icon: HeartPulse },
    { href: `${base}/documentos`, label: "Documentos", icon: FileText },
  ];

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
