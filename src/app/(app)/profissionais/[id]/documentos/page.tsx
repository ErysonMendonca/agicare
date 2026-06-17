import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, FolderOpen } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/Card";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { listProfessionals } from "@/lib/data/professionals";
import { requireView } from "@/lib/permissions";

/**
 * Área de Documentos do profissional (escopo 11.1 — ação "Documentos" do card).
 *
 * Honestidade do protótipo: ainda NÃO há armazenamento de arquivos (nenhum
 * bucket de Supabase Storage provisionado). Esta rota existe de verdade,
 * carrega o profissional (RLS escopa à clínica ativa) e mostra um empty-state
 * que descreve com clareza o ponto de integração — sem simular upload/persistência
 * que não acontece. Ver handoff no relatório (bucket `professional-docs`).
 */
export default async function DocumentosProfissionalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireView("profissionais");
  const { id } = await params;

  // RLS escopa à clínica ativa; id de outra clínica simplesmente não aparece.
  const profissional = (await listProfessionals()).find((p) => p.id === id);
  if (!profissional) notFound();

  return (
    <>
      <PageHeader
        title={`Documentos — ${profissional.nome}`}
        subtitle={`${profissional.especialidade} · ${profissional.crm}`}
        actions={
          <Link
            href="/profissionais"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink transition-colors hover:bg-black/5"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        }
      />

      <Stagger>
        <FadeInUp>
          <Card className="p-10">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <FolderOpen className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-semibold text-ink">
                Nenhum documento disponível
              </h3>
              <p className="mt-2 max-w-md text-sm text-muted">
                A guarda de arquivos do profissional (diplomas, registros de
                conselho, contratos) ainda não está integrada neste protótipo.
                Ao conectar o armazenamento, os documentos enviados aparecerão
                aqui.
              </p>
              <div className="mt-6 flex items-center gap-2 rounded-lg border border-dashed border-line px-4 py-3 text-xs text-muted">
                <FileText className="h-4 w-4" />
                Ponto de integração: bucket de Supabase Storage{" "}
                <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono">
                  professional-docs
                </code>{" "}
                + tabela de metadados.
              </div>
            </div>
          </Card>
        </FadeInUp>
      </Stagger>
    </>
  );
}
