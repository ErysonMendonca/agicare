"use client";

import { useRef, useState } from "react";
import { ChevronLeft, Save, Printer } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { salvarAtendimento } from "@/lib/actions/queue";
import { type FilaItem } from "@/lib/data/queue";

/** Opções fixas (réplica do sistema de referência). */
const ORIGEM = ["1 - RECEPÇÃO", "2 - PRONTO ATENDIMENTO", "3 - INTERNAÇÃO"];
const MEDICOS = ["1 - MÉDICO PADRÃO", "2 - DRA. MARINA SOUZA", "3 - DR. CARLOS EDUARDO"];
const ESPECIALIDADES = ["1 - MÉDICO CLÍNICO", "2 - CARDIOLOGIA", "3 - ORTOPEDIA"];
const ENCAMINHAMENTO = ["1 - PRIMEIRA CONSULTA", "2 - RETORNO", "3 - URGÊNCIA"];
const CARATER = ["1 - URGÊNCIA/EMERGÊNCIA", "2 - ELETIVO"];
const PROCEDENCIA = ["9 - AMBULATÓRIO-CONS", "1 - DOMICÍLIO", "2 - OUTRA UNIDADE"];
const CENTRO_CUSTO = ["187 - RECEPÇÃO PRINCIPAL", "190 - PRONTO ATENDIMENTO"];
const CONVENIOS = ["SUS", "Unimed", "Particular", "Bradesco Saúde", "Amil"];
const PLANOS = ["Ambulatorial", "Hospitalar", "Completo"];
const PARENTESCO = ["Pai", "Mãe", "Cônjuge", "Filho(a)", "Outro"];

export function DadosAtendimentoModal({
  item,
  open,
  onClose,
  onVoltar,
}: {
  item: FilaItem;
  open: boolean;
  onClose: () => void;
  onVoltar: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [plano, setPlano] = useState("");
  const [oMesmo, setOMesmo] = useState(false);
  const [respNome, setRespNome] = useState("");
  const [privado, setPrivado] = useState(false);
  const [gestante, setGestante] = useState(false);
  const [pending, setPending] = useState(false);

  function toggleOMesmo() {
    setOMesmo((v) => {
      const next = !v;
      setRespNome(next ? item.paciente : "");
      return next;
    });
  }

  /** Lê os campos não-controlados do form (defaultValue) por `name`. */
  function readForm(name: string): string {
    const v = formRef.current
      ? new FormData(formRef.current).get(name)
      : null;
    return typeof v === "string" ? v : "";
  }

  /** Mapeia o rótulo do caráter ("1 - URGÊNCIA/…"/"2 - ELETIVO") → enum do banco. */
  function mapCarater(label: string): "urgencia" | "eletivo" | undefined {
    if (!label) return undefined;
    return /URG/i.test(label) ? "urgencia" : "eletivo";
  }

  async function salvar(imprimir: boolean) {
    if (pending) return;
    if (!plano) {
      toast.error("Selecione o plano do convênio.");
      return;
    }

    setPending(true);
    const res = await salvarAtendimento({
      queueEntryId: item.id,
      patientId: item.patientId,
      patientName: item.paciente,
      medico: readForm("medico"),
      especialidade: readForm("especialidade"),
      encaminhamento: readForm("encaminhamento"),
      carater: mapCarater(readForm("carater")),
      procedencia: readForm("procedencia"),
      centroCusto: readForm("centro_custo"),
      origem: readForm("origem"),
      dataEntrada: readForm("data_entrada"),
      privadoLiberdade: privado,
      gestante,
      convenio: readForm("convenio"),
      plano,
      carteira: readForm("carteira"),
      validade: readForm("validade"),
      validador: readForm("validador"),
      respOMesmo: oMesmo,
      respNome,
      respDocumento: readForm("resp_documento"),
      respParentesco: readForm("resp_parentesco"),
      observacoes: readForm("observacoes"),
    });
    setPending(false);

    if (res?.error) {
      toast.error(res.error);
      return;
    }
    // Só imprime DEPOIS de gravar com sucesso.
    toast.success(
      imprimir ? "Atendimento salvo. Gerando impressão…" : "Atendimento salvo.",
    );
    if (imprimir) window.print();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Dados de Atendimento - ${item.paciente}`}
      className="max-w-2xl"
      footer={
        <>
          <Button
            variant="outline"
            onClick={onVoltar}
            className="mr-auto"
            disabled={pending}
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar
          </Button>
          <Button
            variant="primary"
            onClick={() => salvar(false)}
            disabled={pending}
          >
            <Save className="h-4 w-4" />
            Salvar
          </Button>
          <Button
            variant="primary"
            onClick={() => salvar(true)}
            disabled={pending}
          >
            <Printer className="h-4 w-4" />
            Salvar e Imprimir
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
      {/* Cabeçalho do atendimento */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink">Registro</span>
          <span className="inline-flex h-10 items-center rounded-lg bg-brand-50 px-3 text-sm font-semibold text-brand-600">
            AUTO
          </span>
        </div>
        <Input
          type="date"
          name="data_entrada"
          label="Data e Hora da Entrada"
          defaultValue={new Date().toISOString().slice(0, 10)}
        />
        <Select name="origem" label="Origem Atendimento" defaultValue={ORIGEM[0]}>
          {ORIGEM.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
        <div className="flex flex-col justify-center gap-2">
          <Toggle label="Privado de Liberdade?" checked={privado} onChange={setPrivado} />
          <Toggle label="Gestante?" checked={gestante} onChange={setGestante} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select name="medico" label="Médico" defaultValue={MEDICOS[0]}>
          {MEDICOS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
        <Select name="especialidade" label="Especialidade" defaultValue={ESPECIALIDADES[0]}>
          {ESPECIALIDADES.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
        <Select name="encaminhamento" label="Encaminhamento de Atendimento" defaultValue={ENCAMINHAMENTO[0]}>
          {ENCAMINHAMENTO.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
        <Select name="carater" label="Caráter de Atendimento" defaultValue={CARATER[0]}>
          {CARATER.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
        <Select name="procedencia" label="Local Procedência" defaultValue={PROCEDENCIA[0]}>
          {PROCEDENCIA.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
        <Select name="centro_custo" label="Centro de Custo" defaultValue={CENTRO_CUSTO[0]}>
          {CENTRO_CUSTO.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
      </div>

      {/* Dados do Convênio */}
      <fieldset className="mt-5 rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-muted">
          Dados do Convênio
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select name="convenio" label="Convênio *" defaultValue={item.convenio || CONVENIOS[0]}>
            {CONVENIOS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
          <Select
            label="Plano *"
            value={plano}
            onChange={(e) => setPlano(e.target.value)}
          >
            <option value="" disabled>
              Selecione o plano
            </option>
            {PLANOS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
          <Input name="carteira" label="Número da Carteirinha" placeholder="Número da carteirinha" />
          <Input type="date" name="validade" label="Validade da Carteirinha" />
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Validador de Convênio
            </span>
            <Input name="validador" placeholder="Código do validador" />
            <span className="mt-1 block text-xs text-muted">
              Digite o código do validador fornecido pelo convênio
            </span>
          </label>
        </div>
      </fieldset>

      {/* Responsável */}
      <fieldset className="mt-5 rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-muted">Responsável</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Nome</span>
            <div className="flex gap-2">
              <Input
                placeholder="Nome do responsável"
                disabled={oMesmo}
                value={respNome}
                onChange={(e) => setRespNome(e.target.value)}
              />
              <button
                type="button"
                onClick={toggleOMesmo}
                className={`h-10 flex-none rounded-lg px-3 text-sm font-semibold transition-colors ${
                  oMesmo
                    ? "bg-brand-500 text-white"
                    : "border border-line text-ink hover:bg-muted-surface"
                }`}
              >
                O MESMO
              </button>
            </div>
          </label>
          <Input name="resp_documento" label="Documento" placeholder="CPF ou RG" />
          <Select name="resp_parentesco" label="Grau Parentesco" defaultValue="">
            <option value="" disabled>
              Informe o(a) parentesco
            </option>
            {PARENTESCO.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        </div>
      </fieldset>

      {/* Observação */}
      <label htmlFor="obs-atendimento" className="mt-5 block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Observação</span>
        <textarea
          id="obs-atendimento"
          name="observacoes"
          rows={3}
          placeholder="Observações sobre o atendimento..."
          className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </label>
      </form>
    </Modal>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-sm text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 flex-none rounded-full transition-colors ${
          checked ? "bg-brand-500" : "bg-line"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}
