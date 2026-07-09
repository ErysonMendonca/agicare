import Link from "next/link";
import { UserPlus } from "lucide-react";

/**
 * Botão "Novo Paciente" que leva à tela dedicada de cadastro (/pacientes/novo).
 * Substitui o antigo modal — o cadastro completo agora é uma tela própria
 * (wizard em etapas) para melhor visualização ao preencher a ficha.
 */
export function NovoPacienteButton() {
  return (
    <Link
      href="/pacientes/novo"
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-sm transition-all duration-150 ease-out hover:-translate-y-px hover:bg-brand-600 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1"
    >
      <UserPlus className="h-4 w-4" /> Novo Paciente
    </Link>
  );
}
