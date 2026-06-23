"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Download,
  FileText,
  Phone,
  Mail,
  Heart,
  AlertCircle,
  Link2,
  Eye,
  RefreshCw,
  MoreVertical,
  Copy,
  HeartCrack,
  Pencil,
  Users,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import {
  sincronizarCadSus as sincronizarCadSus_action,
  registrarObito,
} from "@/lib/actions/pacientes";
import { EditarPacienteModal } from "./EditarPacienteModal";

/** Forma client-safe do paciente (espelha `Paciente` da data layer — só tipos). */
export type PacienteRow = {
  id: string;
  /** Número de prontuário sequencial por clínica (0057), formatado. */
  numeroProntuario: string;
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  convenio: string;
  tipoSanguineo: string;
  alergia: boolean;
  emTratamento: boolean;
  cardiaco: boolean;
  ativo: boolean;
  obito: boolean;
};

type StatusFiltro = "todos" | "ativos" | "inativos" | "obito";

// CSV no padrão dos Relatórios: separador ";" + BOM UTF-8 (abre no Excel pt-BR).
// Só envolve em aspas quando há caractere que quebraria a célula.
function csvCell(value: string): string {
  return /["\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Escapa texto para interpolação segura no HTML do PDF imprimível.
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Lista de pacientes com busca global (nome/CPF/e-mail), filtro de status e
 * exportação CSV — tudo no client, sobre os dados vindos por props do server.
 * "Ver Ficha" leva para a ficha de detalhe; CadSus é um stub (sem integração).
 */
export function PacientesClient({
  pacientes,
  kpis,
}: {
  pacientes: PacienteRow[];
  kpis: {
    total: number;
    ativos: number;
    comAlergias: number;
    emTratamento: number;
  };
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<StatusFiltro>("todos");
  const [sincronizando, setSincronizando] = useState(false);
  // Paciente alvo do modal "Registrar óbito" (null = fechado).
  const [obitoAlvo, setObitoAlvo] = useState<PacienteRow | null>(null);
  // Paciente alvo do modal "Editar cadastro" (null = fechado).
  const [editarAlvo, setEditarAlvo] = useState<PacienteRow | null>(null);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return pacientes.filter((p) => {
      // Óbito é um sub-estado de inativo: "Inativos" = inativos NÃO falecidos.
      if (status === "ativos" && !p.ativo) return false;
      if (status === "inativos" && (p.ativo || p.obito)) return false;
      if (status === "obito" && !p.obito) return false;
      if (!termo) return true;
      return (
        p.nome.toLowerCase().includes(termo) ||
        p.cpf.toLowerCase().includes(termo) ||
        p.email.toLowerCase().includes(termo) ||
        p.numeroProntuario.toLowerCase().includes(termo)
      );
    });
  }, [pacientes, busca, status]);

  function exportarCSV() {
    if (filtrados.length === 0) {
      toast.error("Nenhum paciente para exportar.");
      return;
    }
    const cabecalho = [
      "Nº Prontuário",
      "Nome",
      "CPF",
      "Telefone",
      "E-mail",
      "Convênio",
      "Tipo Sanguíneo",
      "Status",
    ];
    const linhas = filtrados.map((p) =>
      [
        p.numeroProntuario,
        p.nome,
        p.cpf,
        p.telefone,
        p.email,
        p.convenio,
        p.tipoSanguineo,
        p.obito ? "Óbito" : p.ativo ? "Ativo" : "Inativo",
      ]
        .map(csvCell)
        .join(";"),
    );
    const conteudo = "﻿" + [cabecalho.map(csvCell).join(";"), ...linhas].join("\r\n");
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pacientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtrados.length} paciente(s) exportado(s).`);
  }

  // Exporta a lista (respeitando os filtros) como PDF via print-to-PDF: monta um
  // documento imprimível em um iframe oculto e dispara a impressão do navegador
  // (o usuário escolhe "Salvar como PDF"). Sem dependência nova.
  function exportarPDF() {
    if (filtrados.length === 0) {
      toast.error("Nenhum paciente para exportar.");
      return;
    }
    const hoje = new Date().toLocaleDateString("pt-BR");
    const statusLabel = (p: PacienteRow) =>
      p.obito ? "Óbito" : p.ativo ? "Ativo" : "Inativo";

    const linhas = filtrados
      .map(
        (p) => `<tr>
          <td>${esc(p.numeroProntuario)}</td>
          <td>${esc(p.nome)}</td>
          <td>${esc(p.cpf || "—")}</td>
          <td>${esc(p.telefone || "—")}</td>
          <td>${esc(p.email || "—")}</td>
          <td>${esc(p.convenio || "—")}</td>
          <td>${esc(p.tipoSanguineo || "—")}</td>
          <td>${statusLabel(p)}</td>
        </tr>`,
      )
      .join("");

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
      <title>Pacientes — ${hoje}</title>
      <style>
        * { font-family: Arial, Helvetica, sans-serif; }
        body { margin: 24px; color: #1f2937; }
        h1 { font-size: 18px; margin: 0 0 2px; }
        p.sub { margin: 0 0 16px; color: #6b7280; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
        th { background: #f3f4f6; text-transform: uppercase; font-size: 10px; }
        tr:nth-child(even) td { background: #fafafa; }
        @page { size: A4 landscape; margin: 14mm; }
      </style></head>
      <body>
        <h1>Lista de Pacientes</h1>
        <p class="sub">${filtrados.length} paciente(s) · Gerado em ${hoje}</p>
        <table>
          <thead><tr>
            <th>Nº Prontuário</th><th>Nome</th><th>CPF</th><th>Telefone</th><th>E-mail</th>
            <th>Convênio</th><th>Tipo Sanguíneo</th><th>Status</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </body></html>`;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      toast.error("Não foi possível gerar o PDF.");
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    const win = iframe.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
    // Remove o iframe depois que o diálogo de impressão é fechado.
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1000);
  }

  async function sincronizarCadSus() {
    // STUB HONESTO: a integração real com o CadSUS (DATASUS) exige
    // credencial/certificado do barramento — inexistente neste ambiente. A
    // action NÃO finge sucesso: devolve "não configurado" e exibimos como erro.
    setSincronizando(true);
    toast.loading("Consultando integração CadSUS...", { id: "cadsus" });
    try {
      const res = await sincronizarCadSus_action();
      toast.error(res.error, { id: "cadsus" });
    } catch {
      toast.error("Falha ao acionar a integração CadSUS.", { id: "cadsus" });
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <>
      {/* KPIs: Total e Ativos filtram a tabela (toggle). "Com Alergias" e
          "Em Tratamento" não são valores do filtro de status → informativos. */}
      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FadeInUp>
          <StatCard
            icon={<Users className="h-5 w-5" />}
            value={kpis.total}
            label="Total de Pacientes"
            tone="neutral"
            onClick={() => setStatus("todos")}
            active={status === "todos"}
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Activity className="h-5 w-5" />}
            value={kpis.ativos}
            label="Pacientes Ativos"
            tone="success"
            onClick={() =>
              setStatus((prev) => (prev === "ativos" ? "todos" : "ativos"))
            }
            active={status === "ativos"}
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<AlertCircle className="h-5 w-5" />}
            value={kpis.comAlergias}
            label="Com Alergias"
            tone="warn"
          />
        </FadeInUp>
        <FadeInUp>
          <StatCard
            icon={<Link2 className="h-5 w-5" />}
            value={kpis.emTratamento}
            label="Em Tratamento"
            tone="info"
          />
        </FadeInUp>
      </Stagger>

      <Card className="mt-6 p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label htmlFor="busca" className="mb-1.5 block text-sm font-medium text-ink">
              Buscar Paciente
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                id="busca"
                placeholder="Nº prontuário, nome, CPF ou e-mail..."
                className="pl-9"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
          <Select
            id="status"
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFiltro)}
          >
            <option value="todos">Todos os pacientes</option>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="obito">Óbito</option>
          </Select>
        </div>
      </Card>

      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <h3 className="font-semibold text-ink">
            Lista de Pacientes{" "}
            <span className="text-muted">({filtrados.length} pacientes)</span>
          </h3>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={sincronizarCadSus}
              disabled={sincronizando}
            >
              <RefreshCw
                className={sincronizando ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              />
              {sincronizando ? "Sincronizando..." : "Sincronizar CadSUS"}
            </Button>
            <Button variant="outline" size="sm" onClick={exportarCSV}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportarPDF}>
              <FileText className="h-4 w-4" />
              Exportar PDF
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-line text-left text-xs uppercase text-muted">
                <th className="px-5 py-3 font-medium">Nº Prontuário</th>
                <th className="px-5 py-3 font-medium">Paciente</th>
                <th className="px-5 py-3 font-medium">Contato</th>
                <th className="px-5 py-3 font-medium">Convênio</th>
                <th className="px-5 py-3 font-medium">Tipo Sanguíneo</th>
                <th className="px-5 py-3 font-medium">Informações</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-muted">
                    Nenhum paciente encontrado para os filtros aplicados.
                  </td>
                </tr>
              ) : (
                filtrados.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-5 py-3 font-mono font-medium text-ink">
                      {p.numeroProntuario}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={p.nome} />
                        <div>
                          <Link
                            href={`/pacientes/${p.id}`}
                            className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
                          >
                            {p.nome}
                          </Link>
                          <div className="text-xs text-muted">{p.cpf || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5 text-ink">
                        <Phone className="h-3.5 w-3.5 text-muted" />
                        {p.telefone || "—"}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                        <Mail className="h-3.5 w-3.5" />
                        {p.email || "—"}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-ink">{p.convenio}</td>
                    <td className="px-5 py-3">
                      <Badge status="danger">{p.tipoSanguineo}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {p.alergia && (
                          <AlertCircle
                            className="h-4 w-4 text-red-500"
                            aria-label="Possui alergias"
                          />
                        )}
                        {p.emTratamento && (
                          <Link2
                            className="h-4 w-4 text-purple-500"
                            aria-label="Em tratamento"
                          />
                        )}
                        {p.cardiaco && (
                          <Heart
                            className="h-4 w-4 text-pink-500"
                            aria-label="Condição cardíaca"
                          />
                        )}
                        {!p.alergia && !p.emTratamento && !p.cardiaco && (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {p.ativo ? (
                        <Badge status="ok">Ativo</Badge>
                      ) : (
                        <Badge status="warn">Inativo</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/pacientes/${p.id}`}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-brand-600 active:scale-[0.97]"
                        >
                          <Eye className="h-4 w-4" />
                          Ver Ficha
                        </Link>
                        <AcoesPaciente
                          paciente={p}
                          onEditar={() => setEditarAlvo(p)}
                          onRegistrarObito={() => setObitoAlvo(p)}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ObitoModal
        key={obitoAlvo?.id ?? "none"}
        paciente={obitoAlvo}
        onClose={() => setObitoAlvo(null)}
      />

      {editarAlvo && (
        <EditarPacienteModal
          key={editarAlvo.id}
          patientId={editarAlvo.id}
          onClose={() => setEditarAlvo(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}

/**
 * Menu de ações (kebab) por linha de paciente. Além de "Ver Ficha" (botão fora
 * daqui), oferece: copiar telefone/e-mail e registrar óbito (quando aplicável).
 * O painel usa posição fixa ancorada no botão para não ser cortado pelo
 * overflow da tabela; fecha ao clicar fora, rolar a página ou apertar Esc.
 */
function AcoesPaciente({
  paciente,
  onEditar,
  onRegistrarObito,
}: {
  paciente: PacienteRow;
  onEditar: () => void;
  onRegistrarObito: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null,
  );
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (
        btnRef.current?.contains(t) ||
        menuRef.current?.contains(t)
      )
        return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setCoords({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setOpen((o) => !o);
  }

  async function copiar(texto: string, rotulo: string) {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${rotulo} copiado.`);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  const itemBase =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Mais ações"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-black/5 hover:text-ink"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && coords && (
        <div
          ref={menuRef}
          role="menu"
          style={{ position: "fixed", top: coords.top, right: coords.right }}
          className="z-50 w-48 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg"
        >
          <Link
            href={`/pacientes/${paciente.id}`}
            role="menuitem"
            className={`${itemBase} text-ink hover:bg-black/5`}
            onClick={() => setOpen(false)}
          >
            <Eye className="h-4 w-4 text-muted" /> Ver ficha
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEditar();
            }}
            className={`${itemBase} text-ink hover:bg-black/5`}
          >
            <Pencil className="h-4 w-4 text-muted" /> Editar cadastro
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!paciente.telefone}
            onClick={() => copiar(paciente.telefone, "Telefone")}
            className={`${itemBase} text-ink hover:bg-black/5 disabled:opacity-40`}
          >
            <Copy className="h-4 w-4 text-muted" /> Copiar telefone
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!paciente.email}
            onClick={() => copiar(paciente.email, "E-mail")}
            className={`${itemBase} text-ink hover:bg-black/5 disabled:opacity-40`}
          >
            <Mail className="h-4 w-4 text-muted" /> Copiar e-mail
          </button>
          {!paciente.obito && (
            <>
              <div className="my-1 border-t border-line" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onRegistrarObito();
                }}
                className={`${itemBase} text-red-600 hover:bg-red-50`}
              >
                <HeartCrack className="h-4 w-4" /> Registrar óbito
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Modal "Registrar óbito": coleta data e causa e chama a action `registrarObito`
 * (marca o paciente como inativo). Montado uma vez no componente pai; o paciente
 * alvo controla a abertura. Em sucesso, atualiza a lista (router.refresh).
 */
function ObitoModal({
  paciente,
  onClose,
}: {
  paciente: PacienteRow | null;
  onClose: () => void;
}) {
  const [data, setData] = useState("");
  const [causa, setCausa] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // Campos resetam por remontagem (key={paciente.id} no pai), sem setState-em-effect.

  function handleConfirmar() {
    if (!paciente) return;
    if (!data) {
      toast.error("Informe a data do óbito.");
      return;
    }
    startTransition(async () => {
      const res = await registrarObito(paciente.id, data, causa);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Óbito registrado. Paciente marcado como inativo.");
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open={!!paciente}
      onClose={onClose}
      title="Registrar óbito"
      subtitle={paciente ? paciente.nome : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleConfirmar} disabled={pending}>
            {pending ? "Registrando..." : "Registrar óbito"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <HeartCrack className="mt-0.5 h-5 w-5 flex-none" />
          <p>
            O paciente será marcado como <strong>inativo</strong>. Esta ação fica
            registrada no cadastro.
          </p>
        </div>
        <Input
          id="obito-data"
          type="date"
          label="Data do óbito"
          value={data}
          onChange={(e) => setData(e.target.value)}
          required
        />
        <label htmlFor="obito-causa" className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Causa / observações
          </span>
          <textarea
            id="obito-causa"
            rows={3}
            value={causa}
            onChange={(e) => setCausa(e.target.value)}
            placeholder="Causa do óbito (se conhecida)"
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </div>
    </Modal>
  );
}
