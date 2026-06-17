import Link from "next/link";
import {
  ChevronLeft,
  User,
  MapPin,
  Phone,
  Mail,
  AlertCircle,
  Link2,
  Heart,
  Stethoscope,
  FlaskConical,
  Syringe,
  ClipboardList,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import {
  getPatientFicha,
  type PassagemTipo,
  type Passagem,
} from "@/lib/data/patients";
import { requireView } from "@/lib/permissions";
import { logAccess } from "@/lib/audit";
import { ProntuarioManual } from "./ProntuarioManual";
import { EditarCadastroButton } from "./EditarCadastroButton";

/** Linha rótulo/valor da grade de dados pessoais. */
function Campo({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{value || "—"}</dd>
    </div>
  );
}

const TIMELINE_META: Record<
  PassagemTipo,
  { label: string; icon: LucideIcon; tone: string }
> = {
  consulta: { label: "Consulta", icon: Stethoscope, tone: "text-brand-600 bg-brand-50" },
  exame: { label: "Exame", icon: FlaskConical, tone: "text-blue-600 bg-blue-50" },
  procedimento: { label: "Procedimento", icon: Syringe, tone: "text-purple-600 bg-purple-50" },
  evolucao: { label: "Evolução", icon: ClipboardList, tone: "text-green-600 bg-green-50" },
};

function Timeline({ passagens }: { passagens: Passagem[] }) {
  if (passagens.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nenhuma passagem registrada para este paciente.
      </p>
    );
  }

  return (
    <ol className="relative space-y-5 border-l border-line pl-6">
      {passagens.map((ev) => {
        const meta = TIMELINE_META[ev.tipo];
        const Icone = meta.icon;
        return (
          <li key={ev.id} className="relative">
            <span
              className={`absolute -left-[34px] flex h-7 w-7 items-center justify-center rounded-full ${meta.tone}`}
            >
              <Icone className="h-3.5 w-3.5" />
            </span>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold text-ink">{ev.titulo}</h4>
              <span className="flex items-center gap-1 text-xs text-muted">
                <CalendarClock className="h-3.5 w-3.5" />
                {ev.data}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted">{ev.detalhe || "—"}</p>
            <p className="mt-0.5 text-xs text-muted">{meta.label} · {ev.profissional}</p>
          </li>
        );
      })}
    </ol>
  );
}

export default async function FichaPacientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireView("pacientes");
  const { id } = await params;
  const ficha = await getPatientFicha(id);

  // Auditoria LGPD: ver a ficha completa é acesso a dado pessoal sensível.
  if (ficha) {
    await logAccess({
      patientId: id,
      patientName: ficha.pessoais.nome,
      module: "pacientes",
      action: "view",
    });
  }

  if (!ficha) {
    return (
      <>
        <div className="mb-4">
          <Link
            href="/pacientes"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            <ChevronLeft className="h-4 w-4" /> Voltar aos pacientes
          </Link>
        </div>
        <Card className="p-10 text-center text-sm text-muted">
          Paciente não encontrado ou sem permissão de acesso.
        </Card>
      </>
    );
  }

  const { pessoais, contato, alertas, passagens } = ficha;

  return (
    <>
      <div className="mb-4">
        <Link
          href="/pacientes"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <ChevronLeft className="h-4 w-4" /> Voltar aos pacientes
        </Link>
      </div>

      <PageHeader
        title="Ficha do Paciente"
        subtitle="Dados cadastrais, contato e histórico do prontuário"
        actions={<EditarCadastroButton patientId={ficha.id} />}
      />

      {/* Cabeçalho do paciente */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={pessoais.nome} className="h-14 w-14 text-base" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-ink">{pessoais.nome}</h2>
                {ficha.ativo ? (
                  <Badge status="ok">Ativo</Badge>
                ) : (
                  <Badge status="warn">Inativo</Badge>
                )}
              </div>
              <p className="text-sm text-muted">
                CPF {pessoais.cpf} · CNS {pessoais.cns}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {alertas.alergia && (
              <Badge status="danger">
                <AlertCircle className="h-3.5 w-3.5" /> Alergias
              </Badge>
            )}
            {alertas.emTratamento && (
              <Badge className="bg-purple-50 text-purple-600">
                <Link2 className="h-3.5 w-3.5" /> Em tratamento
              </Badge>
            )}
            {alertas.cardiaco && (
              <Badge className="bg-pink-50 text-pink-600">
                <Heart className="h-3.5 w-3.5" /> Cardíaco
              </Badge>
            )}
          </div>
        </div>

        {ficha.obito && (
          <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
            Óbito registrado em {ficha.obito.data}. Causa: {ficha.obito.causa}.
          </div>
        )}
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Coluna esquerda: dados pessoais + contato */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="p-5">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-ink">
              <User className="h-4 w-4 text-brand-500" /> Dados Pessoais
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Campo label="Nome social" value={pessoais.nomeSocial} />
              <Campo label="Nascimento" value={pessoais.nascimento} />
              <Campo label="Idade" value={pessoais.idade} />
              <Campo label="Gênero" value={pessoais.genero} />
              <Campo label="Tipo sanguíneo" value={pessoais.tipoSanguineo} />
              <Campo label="Estado civil" value={pessoais.estadoCivil} />
              <Campo label="Nome da mãe" value={pessoais.nomeMae} />
              <Campo label="Responsável" value={pessoais.responsavel} />
              <Campo label="Naturalidade" value={pessoais.naturalidade} />
              <Campo label="Nacionalidade" value={pessoais.nacionalidade} />
              <Campo label="Raça/Cor" value={pessoais.raca} />
              <Campo label="Etnia" value={pessoais.etnia} />
              <Campo label="Convênio" value={pessoais.convenio} />
              <Campo label="Plano" value={pessoais.plano} />
            </dl>
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-ink">
              <MapPin className="h-4 w-4 text-brand-500" /> Contato e Endereço
            </h3>
            <dl className="space-y-3">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted" />
                <span className="text-sm text-ink">{contato.telefone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted" />
                <span className="text-sm text-ink">{contato.email}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3">
                <Campo label="CEP" value={contato.cep} />
                <Campo label="UF" value={contato.uf} />
                <div className="col-span-2">
                  <Campo label="Endereço" value={contato.endereco} />
                </div>
                <Campo label="Bairro" value={contato.bairro} />
                <Campo label="Cidade" value={contato.cidade} />
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-ink">
              <ClipboardList className="h-4 w-4 text-brand-500" /> Prontuário Manual
            </h3>
            <ProntuarioManual
              conteudo={ficha.manualRecord}
              patientId={ficha.id}
              temArquivo={!!ficha.manualRecordPath}
              nomeArquivo={ficha.manualRecordName}
            />
            {ficha.notas && (
              <p className="mt-4 border-t border-line pt-3 text-sm text-muted">
                <span className="font-medium text-ink">Observações:</span>{" "}
                {ficha.notas}
              </p>
            )}
          </Card>
        </div>

        {/* Coluna direita: histórico do prontuário (timeline) */}
        <div className="lg:col-span-2">
          <Card className="p-5">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold text-ink">
                <CalendarClock className="h-4 w-4 text-brand-500" /> Histórico do
                Prontuário
              </h3>
              <span className="text-xs text-muted">
                {passagens.length} passagem(ns)
              </span>
            </div>
            <Timeline passagens={passagens} />
          </Card>
        </div>
      </div>
    </>
  );
}
