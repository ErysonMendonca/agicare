"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Plus, Trash2, Stethoscope, Building2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { criarDispensacao, carregarItensPrescritos } from "@/lib/actions/stock";
import { type ProdutoEstoque, type ItemPrescrito } from "@/lib/data/stock";
import { type Paciente } from "@/lib/data/patients";

type Tipo = "prescricao" | "setor";
type Linha = {
  key: number;
  productId: string;
  quantidade: string;
  /** Item prescrito de origem (0043) — propagado p/ registrar o vínculo. */
  prescriptionItemId: string | null;
  /** Posologia prescrita (exibição na linha). */
  posologia: string | null;
};

const novaLinha = (key: number): Linha => ({
  key,
  productId: "",
  quantidade: "",
  prescriptionItemId: null,
  posologia: null,
});

/**
 * Botão "Nova Dispensação" + modal de criação de pedido. Dois fluxos:
 *  • Prescrição → escolhe o PACIENTE (origem) e os itens do catálogo;
 *  • Setor      → informa o SETOR (texto) e os itens do catálogo.
 * Os itens vêm do estoque (produto + quantidade numérica), base da baixa
 * automática na conclusão (trigger 0038).
 *
 * `podePrescricao` (papel clínico admin/médico): só a equipe clínica enxerga
 * prescrições (RLS, LGPD). Para recepção, o fluxo "por prescrição" é ocultado
 * (abre direto em "setor") com aviso honesto — evita o falso "Nenhum
 * medicamento prescrito" causado pela RLS.
 */
export function NovaDispensacaoModal({
  produtos,
  pacientes,
  podePrescricao,
}: {
  produtos: ProdutoEstoque[];
  pacientes: Paciente[];
  podePrescricao: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<Tipo>(podePrescricao ? "prescricao" : "setor");
  const [pacienteId, setPacienteId] = useState("");
  const [setorNome, setSetorNome] = useState("");
  const [setorRef, setSetorRef] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>([novaLinha(1)]);
  const [carregandoPresc, setCarregandoPresc] = useState(false);
  // Medicamentos prescritos SEM produto de estoque vinculado: não viram linha
  // (a baixa exige product_id), mas ficam visíveis para o operador decidir um
  // substituto manualmente — em vez de sumirem num toast efêmero.
  const [semVinculo, setSemVinculo] = useState<ItemPrescrito[]>([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const disponiveis = useMemo(
    () => produtos.filter((p) => p.ativo),
    [produtos],
  );

  function reset() {
    setTipo(podePrescricao ? "prescricao" : "setor");
    setPacienteId("");
    setSetorNome("");
    setSetorRef("");
    setUrgente(false);
    setLinhas([novaLinha(1)]);
    setSemVinculo([]);
  }

  function fechar() {
    setOpen(false);
    reset();
  }

  function addLinha() {
    setLinhas((prev) => [...prev, novaLinha((prev.at(-1)?.key ?? 0) + 1)]);
  }

  function removeLinha(key: number) {
    setLinhas((prev) =>
      prev.length > 1 ? prev.filter((l) => l.key !== key) : prev,
    );
  }

  function setLinha(key: number, patch: Partial<Linha>) {
    setLinhas((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  /**
   * Ao selecionar o paciente no fluxo "por prescrição", pré-preenche os itens a
   * partir dos medicamentos REALMENTE prescritos (RLS aplica o escopo). Só entram
   * os itens com vínculo a um produto de estoque ativo (base da baixa); os demais
   * são omitidos com aviso. O usuário ainda ajusta quantidades e pode editar.
   */
  function carregarPrescricao(pid: string) {
    setCarregandoPresc(true);
    setSemVinculo([]);
    carregarItensPrescritos(pid)
      .then(({ itens, error }) => {
        if (error) {
          toast.error(error);
          return;
        }
        const idsDisponiveis = new Set(disponiveis.map((p) => p.id));
        const vinculados = itens.filter(
          (i) => i.productId && idsDisponiveis.has(i.productId),
        );
        // Prescritos sem produto de estoque (ou produto inativo/inexistente):
        // não viram linha automática, mas ficam sinalizados na tela.
        const orfaos = itens.filter(
          (i) => !i.productId || !idsDisponiveis.has(i.productId),
        );
        setSemVinculo(orfaos);

        if (vinculados.length === 0) {
          setLinhas([novaLinha(1)]);
          toast.info(
            itens.length === 0
              ? "Nenhum medicamento prescrito pendente para este paciente."
              : "Os medicamentos prescritos não têm produto de estoque vinculado.",
          );
          return;
        }

        // Pré-preenche produto + posologia + vínculo; quantidade fica VAZIA
        // (o operador digita conscientemente — sem chumbar "1").
        setLinhas(
          vinculados.map((i, idx) => ({
            key: idx + 1,
            productId: i.productId as string,
            quantidade: "",
            prescriptionItemId: i.prescriptionItemId,
            posologia: i.posologia,
          })),
        );
        if (orfaos.length > 0) {
          toast.info(
            `${orfaos.length} medicamento(s) prescrito(s) sem vínculo de estoque — confira abaixo.`,
          );
        } else {
          toast.success("Itens da prescrição carregados.");
        }
      })
      .finally(() => setCarregandoPresc(false));
  }

  function submit() {
    const itens = linhas
      .map((l) => {
        const prod = disponiveis.find((p) => p.id === l.productId);
        return {
          product_id: l.productId,
          quantity_num: Number(l.quantidade.replace(",", ".")),
          prescription_item_id: l.prescriptionItemId,
          saldo: prod?.saldo ?? 0,
          nome: prod?.produto ?? "produto",
        };
      })
      .filter((i) => i.product_id && Number.isFinite(i.quantity_num) && i.quantity_num > 0);

    if (itens.length === 0) {
      toast.error("Adicione ao menos um item com produto e quantidade.");
      return;
    }

    // Trava de ruptura no client (espelha o servidor): não deixa pedir mais que
    // o saldo. A validação autoritativa é server-side em criarDispensacao.
    const excede = itens.find((i) => i.quantity_num > i.saldo);
    if (excede) {
      toast.error(
        `Quantidade (${excede.quantity_num}) acima do saldo de "${excede.nome}" (disponível: ${excede.saldo}).`,
      );
      return;
    }

    let originName = "";
    let originRef = "";
    let patientId: string | null = null;
    if (tipo === "prescricao") {
      const pac = pacientes.find((p) => p.id === pacienteId);
      if (!pac) {
        toast.error("Selecione o paciente.");
        return;
      }
      patientId = pac.id;
      originName = pac.nome;
      originRef = pac.cpf || "";
    } else {
      if (!setorNome.trim()) {
        toast.error("Informe o setor.");
        return;
      }
      originName = setorNome.trim();
      originRef = setorRef.trim();
    }

    startTransition(async () => {
      const res = await criarDispensacao({
        kind: tipo,
        patient_id: patientId,
        origin_name: originName,
        origin_ref: originRef,
        urgent: urgente,
        items: itens.map((i) => ({
          product_id: i.product_id,
          quantity_num: i.quantity_num,
          prescription_item_id:
            tipo === "prescricao" ? i.prescription_item_id : null,
        })),
      });
      if (res?.ok) {
        toast.success("Dispensação criada.");
        fechar();
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível criar a dispensação.");
      }
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <PackagePlus className="h-4 w-4" />
        Nova Dispensação
      </Button>

      <Modal
        open={open}
        onClose={fechar}
        title="Nova Dispensação"
        subtitle="Crie um pedido por prescrição (paciente) ou por setor"
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={fechar}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Criando..." : "Criar Pedido"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Tipo — o fluxo "por prescrição" só aparece para a equipe clínica
              (admin/médico). Prescrições são dado sensível (LGPD) e a RLS as
              esconde de outros papéis; oferecer o fluxo à recepção só geraria o
              falso "Nenhum medicamento prescrito". */}
          {podePrescricao ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTipo("prescricao")}
                className={
                  tipo === "prescricao"
                    ? "inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-sm font-medium text-white"
                    : "inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-muted hover:text-ink"
                }
              >
                <Stethoscope className="h-4 w-4" /> Prescrição
              </button>
              <button
                type="button"
                onClick={() => {
                  setTipo("setor");
                  setSemVinculo([]);
                }}
                className={
                  tipo === "setor"
                    ? "inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-sm font-medium text-white"
                    : "inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-muted hover:text-ink"
                }
              >
                <Building2 className="h-4 w-4" /> Setor
              </button>
            </div>
          ) : (
            <p className="rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-muted">
              Prescrições são visíveis apenas à equipe clínica. Crie aqui uma
              dispensação <strong>por setor</strong>.
            </p>
          )}

          {/* Origem */}
          {tipo === "prescricao" ? (
            <div>
              <Select
                id="nd-paciente"
                label="Paciente"
                value={pacienteId}
                onChange={(e) => {
                  const pid = e.target.value;
                  setPacienteId(pid);
                  if (pid) {
                    carregarPrescricao(pid);
                  } else {
                    setSemVinculo([]);
                  }
                }}
              >
                <option value="">Selecione o paciente</option>
                {pacientes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                    {p.cpf ? ` — ${p.cpf}` : ""}
                  </option>
                ))}
              </Select>
              {carregandoPresc && (
                <p className="mt-1 text-xs text-muted">
                  Carregando medicamentos prescritos...
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="nd-setor"
                label="Setor"
                placeholder="Ex.: UTI Adulto"
                value={setorNome}
                onChange={(e) => setSetorNome(e.target.value)}
              />
              <Input
                id="nd-setor-ref"
                label="Identificador (opcional)"
                placeholder="Ex.: SET-UTI-01"
                value={setorRef}
                onChange={(e) => setSetorRef(e.target.value)}
              />
            </div>
          )}

          {/* Itens */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Itens do pedido</p>
              <Button variant="outline" size="sm" onClick={addLinha} type="button">
                <Plus className="h-4 w-4" /> Adicionar item
              </Button>
            </div>
            <div className="space-y-3">
              {linhas.map((l) => {
                const prod = disponiveis.find((p) => p.id === l.productId);
                const saldo = prod?.saldo ?? null;
                const qtd = Number(l.quantidade.replace(",", "."));
                const excede =
                  saldo !== null &&
                  l.quantidade.trim() !== "" &&
                  Number.isFinite(qtd) &&
                  qtd > saldo;
                return (
                  <div key={l.key}>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Select
                          value={l.productId}
                          onChange={(e) =>
                            setLinha(l.key, { productId: e.target.value })
                          }
                        >
                          <option value="">Selecione o produto</option>
                          {disponiveis.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.produto} ({p.unidade})
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="w-28">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="Qtd"
                          value={l.quantidade}
                          onChange={(e) =>
                            setLinha(l.key, { quantidade: e.target.value })
                          }
                          aria-invalid={excede || undefined}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLinha(l.key)}
                        disabled={linhas.length === 1}
                        aria-label="Remover item"
                        className="mb-1 rounded-lg p-2 text-muted hover:text-red-600 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {/* Posologia prescrita + saldo disponível por linha */}
                    {(l.posologia || saldo !== null) && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-1 text-xs">
                        {l.posologia && (
                          <span className="text-muted">
                            Posologia: {l.posologia}
                          </span>
                        )}
                        {saldo !== null && (
                          <span
                            className={
                              excede ? "font-medium text-red-600" : "text-muted"
                            }
                          >
                            Saldo: {saldo} {prod?.unidade ?? ""}
                            {excede ? " — acima do disponível" : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Prescritos sem vínculo de estoque (informativo, não bloqueante) */}
          {tipo === "prescricao" && semVinculo.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                Prescritos sem produto de estoque vinculado
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                Não entram automaticamente na baixa. Selecione um produto
                equivalente acima, se necessário.
              </p>
              <ul className="mt-2 space-y-1">
                {semVinculo.map((i, idx) => (
                  <li
                    key={`${i.productId ?? "sn"}-${idx}`}
                    className="text-xs text-amber-800"
                  >
                    • {i.nome}
                    {i.concentracao ? ` ${i.concentracao}` : ""}
                    {i.posologia ? ` — ${i.posologia}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Urgente */}
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={urgente}
              onChange={(e) => setUrgente(e.target.checked)}
              className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-200"
            />
            Marcar como urgente
          </label>
        </div>
      </Modal>
    </>
  );
}
