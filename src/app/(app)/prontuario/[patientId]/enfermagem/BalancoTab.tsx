"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Droplets,
  Plus,
  TrendingUp,
  TrendingDown,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import {
  type BalancoHidrico,
  type OpcaoPaciente,
} from "@/lib/data/enfermagem";
import {
  registrarLancamentoHidrico,
  fecharBalancoHidrico,
} from "@/lib/actions/enfermagem";
import { abrirCicloBalanco } from "@/lib/actions/balanco";
import { EmptyState, PacienteSelect } from "./Shared";

type LinhaHora = {
  hora: string;
  ganhos: number;
  perdas: number;
  saldo: number;
  acumulado: number;
};

export function BalancoTab({
  balanco,
  pacientes,
}: {
  balanco: BalancoHidrico | null;
  pacientes: OpcaoPaciente[];
}) {
  const [openLancamento, setOpenLancamento] = useState(false);
  const [openCiclo, setOpenCiclo] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const linhas = useMemo<LinhaHora[]>(() => {
    if (!balanco) return [];
    const mapa = new Map<string, { ganhos: number; perdas: number }>();
    for (const l of balanco.lancamentos) {
      const atual = mapa.get(l.hora) ?? { ganhos: 0, perdas: 0 };
      if (l.tipo === "ganho") atual.ganhos += l.volume;
      else atual.perdas += l.volume;
      mapa.set(l.hora, atual);
    }
    let acumulado = 0;
    return [...mapa.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hora, v]) => {
        const saldo = v.ganhos - v.perdas;
        acumulado += saldo;
        return { hora, ganhos: v.ganhos, perdas: v.perdas, saldo, acumulado };
      });
  }, [balanco]);

  if (!balanco) {
    return (
      <div className="mt-6 flex flex-col items-center gap-4">
        <EmptyState
          icon={<Droplets className="h-7 w-7" />}
          title="Nenhum ciclo de balanço aberto"
          subtitle="Abra um ciclo de 24h para registrar ganhos e perdas do paciente."
        />
        <Button onClick={() => setOpenCiclo(true)}>
          <Plus className="h-4 w-4" />
          Abrir ciclo 24h
        </Button>
        <AbrirCicloModal
          open={openCiclo}
          onClose={() => setOpenCiclo(false)}
          pacientes={pacientes}
        />
      </div>
    );
  }

  const positivo = balanco.saldo >= 0;

  function handleFechar() {
    startTransition(async () => {
      const res = await fecharBalancoHidrico(balanco!.id);
      if (res?.ok) {
        toast.success("Ciclo de balanço fechado.");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível fechar o ciclo.");
      }
    });
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{balanco.paciente}</h2>
          <p className="text-sm text-muted">
            Ciclo iniciado em {balanco.inicioCiclo}
            {balanco.fechado && (
              <Badge status="ok" className="ml-2">
                Fechado
              </Badge>
            )}
          </p>
        </div>
        {!balanco.fechado && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleFechar} disabled={pending}>
              <Lock className="h-4 w-4" />
              Fechar ciclo
            </Button>
            <Button onClick={() => setOpenLancamento(true)}>
              <Plus className="h-4 w-4" />
              Novo lançamento
            </Button>
          </div>
        )}
        {balanco.fechado && (
          <Button onClick={() => setOpenCiclo(true)}>
            <Plus className="h-4 w-4" />
            Abrir novo ciclo 24h
          </Button>
        )}
      </div>

      {/* Dashboard resumo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-green-600">
            <TrendingUp className="h-5 w-5" />
            <span className="text-sm font-medium">Ganhos (entradas)</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-ink">
            {balanco.totalGanhos} ml
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-red-600">
            <TrendingDown className="h-5 w-5" />
            <span className="text-sm font-medium">Perdas (saídas)</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-ink">
            {balanco.totalPerdas} ml
          </div>
        </Card>
        <Card className={positivo ? "bg-blue-50 p-5" : "bg-purple-50 p-5"}>
          <div
            className={
              positivo
                ? "flex items-center gap-2 text-blue-600"
                : "flex items-center gap-2 text-purple-600"
            }
          >
            <Droplets className="h-5 w-5" />
            <span className="text-sm font-medium">
              Saldo {positivo ? "positivo" : "negativo"}
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-ink">
            {positivo ? "+" : ""}
            {balanco.saldo} ml
          </div>
        </Card>
      </div>

      {/* Saldo horário e acumulado */}
      <Card className="overflow-hidden">
        <div className="border-b border-line p-4">
          <h3 className="font-semibold text-ink">Saldo horário e acumulado</h3>
        </div>
        {linhas.length === 0 ? (
          <p className="p-6 text-sm text-muted">Sem lançamentos no ciclo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-4 py-3 font-medium">Hora</th>
                  <th className="px-4 py-3 font-medium">Ganhos</th>
                  <th className="px-4 py-3 font-medium">Perdas</th>
                  <th className="px-4 py-3 font-medium">Saldo horário</th>
                  <th className="px-4 py-3 font-medium">Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.hora} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{l.hora}</td>
                    <td className="px-4 py-3 text-green-600">+{l.ganhos} ml</td>
                    <td className="px-4 py-3 text-red-600">-{l.perdas} ml</td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {l.saldo > 0 ? "+" : ""}
                      {l.saldo} ml
                    </td>
                    <td className="px-4 py-3 font-semibold text-ink">
                      {l.acumulado > 0 ? "+" : ""}
                      {l.acumulado} ml
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <LancamentoModal
        open={openLancamento}
        onClose={() => setOpenLancamento(false)}
        balanceId={balanco.id}
      />
      <AbrirCicloModal
        open={openCiclo}
        onClose={() => setOpenCiclo(false)}
        pacientes={pacientes}
      />
    </div>
  );
}

function AbrirCicloModal({
  open,
  onClose,
  pacientes,
}: {
  open: boolean;
  onClose: () => void;
  pacientes: OpcaoPaciente[];
}) {
  const [pacienteId, setPacienteId] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleAbrir() {
    if (!pacienteId) {
      toast.error("Selecione o paciente.");
      return;
    }
    startTransition(async () => {
      const res = await abrirCicloBalanco({ patient_id: pacienteId });
      if (res?.ok) {
        toast.success("Ciclo de balanço aberto.");
        setPacienteId("");
        router.refresh();
        onClose();
      } else {
        toast.error(res?.error ?? "Não foi possível abrir o ciclo.");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Abrir ciclo de balanço (24h)"
      subtitle="Inicia um novo período de controle de ganhos e perdas"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleAbrir} disabled={pending}>
            {pending ? "Abrindo…" : "Abrir ciclo"}
          </Button>
        </>
      }
    >
      <PacienteSelect
        pacientes={pacientes}
        value={pacienteId}
        onChange={setPacienteId}
        id="ciclo-paciente"
      />
    </Modal>
  );
}

function LancamentoModal({
  open,
  onClose,
  balanceId,
}: {
  open: boolean;
  onClose: () => void;
  balanceId: string;
}) {
  const [kind, setKind] = useState<"ganho" | "perda">("ganho");
  const [descricao, setDescricao] = useState("");
  const [volume, setVolume] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSalvar() {
    if (!descricao.trim()) {
      toast.error("Descreva o lançamento.");
      return;
    }
    if (!volume || Number(volume) <= 0) {
      toast.error("Informe um volume válido.");
      return;
    }
    startTransition(async () => {
      const res = await registrarLancamentoHidrico({
        balance_id: balanceId,
        kind,
        description: descricao,
        volume_ml: volume,
      });
      if (res?.ok) {
        toast.success("Lançamento registrado.");
        setDescricao("");
        setVolume("");
        setKind("ganho");
        router.refresh();
        onClose();
      } else {
        toast.error(res?.error ?? "Não foi possível registrar.");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo lançamento hídrico"
      subtitle="Registre um ganho (entrada) ou perda (saída)"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={pending}>
            Registrar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setKind("ganho")}
            className={
              kind === "ganho"
                ? "rounded-xl border-2 border-green-500 bg-green-50 px-4 py-3 text-sm font-medium text-green-700"
                : "rounded-xl border border-line bg-white px-4 py-3 text-sm font-medium text-muted hover:text-ink"
            }
          >
            Ganho (entrada)
          </button>
          <button
            type="button"
            onClick={() => setKind("perda")}
            className={
              kind === "perda"
                ? "rounded-xl border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                : "rounded-xl border border-line bg-white px-4 py-3 text-sm font-medium text-muted hover:text-ink"
            }
          >
            Perda (saída)
          </button>
        </div>
        <label htmlFor="lancamento-desc" className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Descrição
          </span>
          <Select
            id="lancamento-desc"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          >
            <option value="">Selecione...</option>
            {(kind === "ganho"
              ? ["Soro fisiológico", "Dieta enteral", "Dieta via oral", "Medicação EV", "Hemoderivados"]
              : ["Diurese", "Drenagem", "Vômito", "Evacuação", "Perdas insensíveis"]
            ).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </label>
        <Input
          label="Volume (ml)"
          type="number"
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
        />
      </div>
    </Modal>
  );
}
