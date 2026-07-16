"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, X, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/lib/store/confirm";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  ATTENDANCE_OPTION_CATEGORIES,
  type AttendanceOptionCategory,
  type AttendanceOptionsByCategory,
} from "@/lib/data/attendance-options.shared";
import {
  addAttendanceOption,
  updateAttendanceOption,
  removeAttendanceOption,
} from "@/lib/actions/attendance-options";

/** Rótulos amigáveis das categorias (PT-BR). */
const CATEGORY_LABELS: Record<AttendanceOptionCategory, string> = {
  origem: "Origem do Atendimento",
  medico: "Médico",
  especialidade: "Especialidade",
  encaminhamento: "Encaminhamento",
  carater: "Caráter do Atendimento",
  procedencia: "Local de Procedência",
  centro_custo: "Centro de Custo",
  convenio: "Convênio",
  plano: "Plano",
  parentesco: "Grau de Parentesco",
  // Catálogos de alta têm telas dedicadas (não editar aqui) — excluídos abaixo.
  motivo_alta: "Motivos de Alta",
  detalhe_alta: "Detalhes de Alta",
  // Catálogos do cadastro de produto (gerenciáveis aqui pelo gestor).
  tipo_produto: "Tipo de Produto",
  grupo_produto: "Grupo de Produto",
  unidade_medida: "Unidade de Medida",
  via_administracao: "Via de Administração",
  principio_ativo: "Princípio Ativo",
  marca: "Marca",
  localizacao: "Localização",
  classificacao_xyz: "Classificação XYZ",
  tipo_profissional: "Tipo de Profissional",
  departamento: "Departamento",
};

/**
 * Categorias editáveis neste editor genérico. Os catálogos de ALTA
 * (motivo_alta/detalhe_alta) têm telas próprias com suporte a vínculo pai→filho
 * (parent_id), então são omitidos aqui para não gerar detalhe órfão sem motivo.
 */
const EDITABLE_CATEGORIES = ATTENDANCE_OPTION_CATEGORIES.filter(
  (c) =>
    c !== "motivo_alta" &&
    c !== "detalhe_alta" &&
    // Catálogos do produto geridos pela tela rica "Produto" (Configurações) —
    // evita gestão duplicada da mesma categoria em dois lugares.
    c !== "unidade_medida" &&
    c !== "via_administracao" &&
    c !== "principio_ativo" &&
    c !== "marca" &&
    c !== "localizacao" &&
    c !== "classificacao_xyz" &&
    // Tipo de profissional possui aba própria.
    c !== "tipo_profissional",
);

export function AtendimentoOpcoes({
  options,
}: {
  options: AttendanceOptionsByCategory;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [categoria, setCategoria] = useState<AttendanceOptionCategory>("origem");
  const [pending, startTransition] = useTransition();

  // Formulário de adição.
  const [novoLabel, setNovoLabel] = useState("");
  const [novoValue, setNovoValue] = useState("");

  // Edição inline.
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editValue, setEditValue] = useState("");

  const lista = options[categoria] ?? [];

  function refresh() {
    router.refresh();
  }

  function adicionar() {
    const label = novoLabel.trim();
    const value = (novoValue.trim() || label).trim();
    if (!label) {
      toast.error("Informe o rótulo da opção.");
      return;
    }
    startTransition(async () => {
      const res = await addAttendanceOption({ category: categoria, label, value });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Opção adicionada.");
      setNovoLabel("");
      setNovoValue("");
      refresh();
    });
  }

  function iniciarEdicao(id: string, label: string, value: string) {
    setEditId(id);
    setEditLabel(label);
    setEditValue(value);
  }

  function salvarEdicao() {
    if (!editId) return;
    const label = editLabel.trim();
    const value = editValue.trim();
    if (!label || !value) {
      toast.error("Rótulo e valor são obrigatórios.");
      return;
    }
    startTransition(async () => {
      const res = await updateAttendanceOption(editId, { label, value });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Opção atualizada.");
      setEditId(null);
      refresh();
    });
  }

  async function remover(id: string, label: string) {
    if (!(await confirm({ message: `Remover a opção "${label}"? Esta ação não pode ser desfeita.`, danger: true, confirmLabel: "Remover" }))) return;
    startTransition(async () => {
      const res = await removeAttendanceOption(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Opção removida.");
      refresh();
    });
  }

  return (
    <Card className="max-w-3xl">
      <CardBody>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <ListChecks className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-ink">Dados de Atendimento</h3>
            <p className="text-xs text-muted">
              Parametrize as opções da ficha de atendimento por categoria
            </p>
          </div>
        </div>

        {/* Seletor de categoria */}
        <Select
          id="cat-atendimento"
          label="Categoria"
          value={categoria}
          onChange={(e) => {
            setCategoria(e.target.value as AttendanceOptionCategory);
            setEditId(null);
          }}
        >
          {EDITABLE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>

        {/* Lista das opções */}
        <div className="mt-5 space-y-2">
          {lista.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              Nenhuma opção cadastrada nesta categoria.
            </p>
          ) : (
            lista.map((opt) => {
              const emEdicao = editId === opt.id;
              return (
                <div
                  key={opt.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3"
                >
                  {emEdicao ? (
                    <>
                      <Input
                        aria-label="Rótulo"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="min-w-0 flex-1"
                        placeholder="Rótulo"
                      />
                      <Input
                        aria-label="Valor"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="min-w-0 flex-1"
                        placeholder="Valor"
                      />
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={salvarEdicao}
                        disabled={pending}
                        aria-label="Salvar edição"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditId(null)}
                        disabled={pending}
                        aria-label="Cancelar edição"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink">
                          {opt.label}
                        </div>
                        {opt.value !== opt.label && (
                          <div className="truncate text-xs text-muted">
                            valor: {opt.value}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => iniciarEdicao(opt.id, opt.label, opt.value)}
                        disabled={pending}
                        aria-label={`Editar ${opt.label}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remover(opt.id, opt.label)}
                        disabled={pending}
                        aria-label={`Remover ${opt.label}`}
                      >
                        <Trash2 className="h-4 w-4 text-status-danger" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Adicionar nova opção */}
        <div className="mt-5 rounded-xl border border-line bg-muted-surface p-4">
          <h4 className="mb-3 text-sm font-semibold text-ink">Adicionar opção</h4>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input
              id="novo-label"
              label="Rótulo"
              value={novoLabel}
              onChange={(e) => setNovoLabel(e.target.value)}
              placeholder="Ex.: 1 - RECEPÇÃO"
              className="flex-1"
            />
            <Input
              id="novo-value"
              label="Valor (opcional)"
              value={novoValue}
              onChange={(e) => setNovoValue(e.target.value)}
              placeholder="Padrão = rótulo"
              className="flex-1"
            />
            <Button
              type="button"
              variant="primary"
              onClick={adicionar}
              disabled={pending}
            >
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
