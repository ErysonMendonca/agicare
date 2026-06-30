import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { getResumo } from "@/lib/data/prontuario";
import { listPrescricoes } from "@/lib/data/prescricao";
import { getSettings } from "@/lib/data/settings";
import { logAccess } from "@/lib/audit";
import { ReceitaClient } from "./ReceitaClient";

// ════════════════════════════════════════════════════════════════
// Receituário imprimível (escopo 5.7) — documento de receita médica REAL
// gerado a partir das prescriptions/prescription_items do paciente.
//
// Server Component: carrega cabeçalho da clínica (clinic_settings),
// identificação do paciente e a prescrição escolhida (?p=<id>, senão a mais
// recente). Registra acesso LGPD com ação "print" (best-effort).
// ════════════════════════════════════════════════════════════════

export default async function ReceitaPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { patientId } = await params;
  const { p } = await searchParams;

  const [resumo, prescricoes, settings] = await Promise.all([
    getResumo(patientId),
    listPrescricoes(patientId),
    getSettings(),
  ]);

  const identificacao = resumo?.identificacao ?? null;

  // Auditoria LGPD: emissão/impressão de receita é acesso a dado sensível.
  if (identificacao) {
    await logAccess({
      patientId,
      patientName: identificacao.nome,
      module: "Receituário",
      action: "print",
    });
  }

  const prescricao = p
    ? prescricoes.find((pr) => pr.id === p) ?? prescricoes[0] ?? null
    : prescricoes[0] ?? null;

  const voltar = (
    <div className="mb-4">
      <Link
        href={`/prontuario/${patientId}/prescricao`}
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar à prescrição
      </Link>
    </div>
  );

  if (!identificacao || !prescricao) {
    return (
      <>
        {voltar}
        <Card className="p-10 text-center text-sm text-muted">
          {identificacao
            ? "Nenhuma prescrição encontrada para gerar a receita."
            : "Paciente não encontrado ou sem permissão de acesso."}
        </Card>
      </>
    );
  }

  return (
    <>
      {voltar}
      <ReceitaClient
        clinica={{
          nome: settings.clinicName,
          cnpj: settings.cnpj,
          endereco: settings.address,
          telefone: settings.phone,
        }}
        paciente={{
          nome: identificacao.nome,
          registro: identificacao.registro,
          atendimentoCodigo: identificacao.atendimentoCodigo,
          idade: identificacao.idade,
          convenio: identificacao.convenio,
        }}
        prescricao={prescricao}
      />
    </>
  );
}
