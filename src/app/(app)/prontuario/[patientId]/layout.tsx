import { requireView } from "@/lib/permissions";

/**
 * Guard centralizado das subpáginas clínicas do prontuário.
 *
 * Todas as rotas sob `prontuario/[patientId]/...` (resumo, anamnese, evolução,
 * prescrição, exames, documentos, checagem, protético) carregam dado clínico e
 * de identificação do paciente (LGPD). Sem este layout, um deep-link direto
 * (ex.: /prontuario/<uuid>/evolucao) burlaria o gate de módulo que só existia
 * em `prontuario/page.tsx`. Concentrando o `requireView` aqui, qualquer rota
 * nova criada dentro de `[patientId]/` herda o guard automaticamente.
 */
export default async function ProntuarioPacienteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireView("prontuario");
  return children;
}
