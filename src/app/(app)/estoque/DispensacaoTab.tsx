"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Filter,
  Search,
  User,
  Calendar,
  Stethoscope,
  Building2,
  Pill,
  PackageCheck,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { type Dispensacao, type ProdutoEstoque } from "@/lib/data/stock";
import { type Paciente } from "@/lib/data/patients";
import { iniciarSeparacao } from "@/lib/actions/stock";
import { SeparacaoModal } from "./SeparacaoModal";
import { NovaDispensacaoModal } from "./NovaDispensacaoModal";

type FiltroTipo = "todos" | "Prescrição" | "Setor";

export function DispensacaoTab({
  pedidos,
  produtos,
  pacientes,
  podePrescricao,
}: {
  pedidos: Dispensacao[];
  produtos: ProdutoEstoque[];
  pacientes: Paciente[];
  podePrescricao: boolean;
}) {
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [separando, setSeparando] = useState<Dispensacao | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const prescricoes = pedidos.filter((p) => p.tipo === "Prescrição").length;
  const setores = pedidos.filter((p) => p.tipo === "Setor").length;

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pedidos.filter((p) => {
      const okTipo = filtroTipo === "todos" || p.tipo === filtroTipo;
      const okStatus = filtroStatus === "todos" || p.statusRaw === filtroStatus;
      const okBusca =
        !q ||
        p.codigo.toLowerCase().includes(q) ||
        p.origem.nome.toLowerCase().includes(q);
      return okTipo && okStatus && okBusca;
    });
  }, [pedidos, filtroTipo, filtroStatus, busca]);

  function handleIniciar(pedido: Dispensacao) {
    startTransition(async () => {
      const res = await iniciarSeparacao(pedido.id);
      if (res?.ok) {
        toast.success("Separação iniciada.");
        router.refresh();
        setSeparando({ ...pedido, statusRaw: "separacao" });
      } else {
        toast.error(res?.error ?? "Não foi possível iniciar a separação.");
      }
    });
  }

  return (
    <div className="mt-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Dispensação de Pedidos</h2>
          <p className="text-sm text-muted">
            Gerencie pedidos de prescrição médica e requisições de setor
          </p>
        </div>
        <NovaDispensacaoModal
          produtos={produtos}
          pacientes={pacientes}
          podePrescricao={podePrescricao}
        />
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-muted">
              <Filter className="h-4 w-4" /> Filtros:
            </span>
            <FiltroChip
              ativo={filtroTipo === "todos"}
              onClick={() => setFiltroTipo("todos")}
              cor="brand"
            >
              Todos ({pedidos.length})
            </FiltroChip>
            <FiltroChip
              ativo={filtroTipo === "Prescrição"}
              onClick={() => setFiltroTipo("Prescrição")}
              cor="purple"
            >
              Prescrições ({prescricoes})
            </FiltroChip>
            <FiltroChip
              ativo={filtroTipo === "Setor"}
              onClick={() => setFiltroTipo("Setor")}
              cor="blue"
            >
              Setores ({setores})
            </FiltroChip>
          </div>

          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <div className="sm:w-48">
              <Select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
              >
                <option value="todos">Todos os Status</option>
                <option value="pendente">Pendente</option>
                <option value="separacao">Em Separação</option>
                <option value="concluido">Concluído</option>
              </Select>
            </div>
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                type="search"
                placeholder="Buscar por código, paciente ou setor..."
                className="pl-9"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Lista de pedidos */}
      {filtrados.length === 0 ? (
        <Card className="mt-4 p-12 text-center text-muted">
          <PackageCheck className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Nenhum pedido encontrado para os filtros atuais.
        </Card>
      ) : (
        <Stagger className="mt-4 flex flex-col gap-4">
          {filtrados.map((pedido) => (
            <FadeInUp key={pedido.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-ink">{pedido.codigo}</h3>
                    {pedido.tipo === "Prescrição" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-600">
                        <Stethoscope className="h-3 w-3" /> Prescrição
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600">
                        <Building2 className="h-3 w-3" /> Setor
                      </span>
                    )}
                    <Badge status={pedido.status.tone}>{pedido.status.label}</Badge>
                    {pedido.urgente && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600">
                        <Zap className="h-3 w-3" /> Urgente
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {pedido.statusRaw === "separacao" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSeparando(pedido)}
                      >
                        <PackageCheck className="h-4 w-4" /> Continuar Separação
                      </Button>
                    ) : pedido.statusRaw === "pendente" ? (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={pending}
                        onClick={() => handleIniciar(pedido)}
                      >
                        <PackageCheck className="h-4 w-4" /> Iniciar Separação
                      </Button>
                    ) : (
                      <Badge status="ok">Concluído</Badge>
                    )}
                  </div>
                </div>

                {pedido.statusRaw === "separacao" && (
                  <div className="mt-3">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted-surface">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${pedido.progresso}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase text-muted">
                      {pedido.origem.rotulo}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 font-medium text-ink">
                      <User className="h-4 w-4 text-muted" /> {pedido.origem.nome}
                    </p>
                    <p className="text-sm text-muted">
                      {pedido.origem.identificador}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted">Solicitante</p>
                    <p className="mt-1 flex items-center gap-1.5 font-medium text-ink">
                      <Stethoscope className="h-4 w-4 text-muted" />{" "}
                      {pedido.solicitante.nome}
                    </p>
                    <p className="flex items-center gap-1.5 text-sm text-muted">
                      <Calendar className="h-3.5 w-3.5" /> {pedido.solicitante.data}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-line bg-canvas p-4">
                  <p className="text-xs font-medium uppercase text-muted">
                    Itens Solicitados
                  </p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {pedido.itens.map((item, i) => (
                      <li
                        key={`${item.nome}-${i}`}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="flex items-center gap-1.5 text-ink">
                          <Pill className="h-4 w-4 text-muted" /> {item.nome}
                        </span>
                        <span className="text-muted">{item.quantidade}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            </FadeInUp>
          ))}
        </Stagger>
      )}

      {separando && (
        <SeparacaoModal
          pedido={separando}
          open={!!separando}
          onClose={() => setSeparando(null)}
        />
      )}
    </div>
  );
}

function FiltroChip({
  ativo,
  onClick,
  cor,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  cor: "brand" | "purple" | "blue";
  children: React.ReactNode;
}) {
  const cores: Record<string, string> = {
    brand: "bg-brand-500 text-white",
    purple: "bg-purple-50 text-purple-600",
    blue: "bg-blue-50 text-blue-600",
  };
  const ativoCls = "bg-brand-500 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        ativo ? ativoCls : cores[cor]
      }`}
    >
      {children}
    </button>
  );
}
