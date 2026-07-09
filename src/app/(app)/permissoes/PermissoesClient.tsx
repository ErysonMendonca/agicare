"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";

import { ShieldCheck, Save, Info, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { savePermissions } from "@/lib/actions/permissions";
import { excluirCargo, criarCargo } from "@/lib/actions/usuarios";
import {
  MODULES,
  MODULE_LABELS,
  type ModuleSlug,
  type ModulePermission,
  type PermissionRow,
  type Scope,
} from "@/lib/permissions.shared";
import { UserCog, Plus } from "lucide-react";
import type { Cargo } from "@/lib/data/usuarios.shared";

/** Papéis geridos aqui (paciente NÃO entra como usuário — removido). */
type ManagedRole = "admin" | "medico" | "recepcao";

// Papéis na ordem das abas + rótulo/descrição PT-BR.
const ROLES: { role: ManagedRole; label: string; desc: string }[] = [
  { role: "admin", label: "Administrador", desc: "Acesso total à plataforma" },
  { role: "medico", label: "Médico", desc: "Atendimento e prontuário" },
  { role: "recepcao", label: "Recepção", desc: "Fila, agenda e cadastro" },
];

type Matrix = Record<ManagedRole, Record<ModuleSlug, ModulePermission>>;

/** Monta a matriz editável a partir das linhas vindas do servidor. */
function buildMatrix(rows: PermissionRow[]): Matrix {
  const base = ROLES.reduce((acc, { role }) => {
    acc[role] = MODULES.reduce((m, module) => {
      m[module] = { canView: false, scope: "all" };
      return m;
    }, {} as Record<ModuleSlug, ModulePermission>);
    return acc;
  }, {} as Matrix);

  for (const r of rows) {
    // Linhas de papéis não geridos aqui (ex.: paciente) são ignoradas.
    const role = r.role as ManagedRole;
    if (base[role] && base[role][r.module]) {
      base[role][r.module] = { canView: r.canView, scope: r.scope };
    }
  }
  return base;
}

/** Achata a matriz em PermissionRow[] (todas as combinações role × module). */
function flatten(matrix: Matrix): PermissionRow[] {
  return ROLES.flatMap(({ role }) =>
    MODULES.map((module) => ({
      role,
      module,
      canView: matrix[role][module].canView,
      scope: matrix[role][module].scope,
    })),
  );
}

export function PermissoesClient({
  initialRows,
  cargos,
}: {
  initialRows: PermissionRow[];
  cargos: Cargo[];
}) {
  const [matrix, setMatrix] = useState<Matrix>(() => buildMatrix(initialRows));
  const [selectedOption, setSelectedOption] = useState<string>("medico");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const activeRole = selectedOption.split(":")[0] as ManagedRole;
  const isAdminTab = activeRole === "admin";

  useEffect(() => {
    setCurrentPage(1);
  }, [activeRole]);

  const ITEMS_PER_PAGE = 5;
  const totalPages = Math.ceil(MODULES.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedModules = MODULES.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const setCanView = (module: ModuleSlug, canView: boolean) => {
    setMatrix((prev) => ({
      ...prev,
      [activeRole]: {
        ...prev[activeRole],
        [module]: { ...prev[activeRole][module], canView },
      },
    }));
  };

  const setScope = (module: ModuleSlug, scope: Scope) => {
    setMatrix((prev) => ({
      ...prev,
      [activeRole]: {
        ...prev[activeRole],
        [module]: { ...prev[activeRole][module], scope },
      },
    }));
  };
  const current = matrix[activeRole];
  const allChecked = MODULES.every((mod) => current[mod].canView);


  const handleToggleAll = (checked: boolean) => {
    setMatrix((prev) => {
      const updatedRoleMatrix = { ...prev[activeRole] };
      MODULES.forEach((mod) => {
        updatedRoleMatrix[mod] = {
          ...updatedRoleMatrix[mod],
          canView: checked,
        };
      });
      return {
        ...prev,
        [activeRole]: updatedRoleMatrix,
      };
    });
  };

  const handleSave = () => {
    const rows = flatten(matrix);
    startTransition(async () => {
      const state = await savePermissions(rows);
      if (state?.ok) {
        toast.success("Permissões atualizadas");
        router.refresh();
      } else if (state?.error) {
        toast.error(state.error);
      }
    });
  };

  const handleExcluirCargo = (cargoId: string, nome: string) => {
    if (!confirm(`Tem certeza que deseja excluir o cargo "${nome}"?`)) return;
    startTransition(async () => {
      const state = await excluirCargo(cargoId);
      if (state?.ok) {
        toast.success(`Cargo "${nome}" excluído com sucesso.`);
        router.refresh();
      } else if (state?.error) {
        toast.error(state.error);
      }
    });
  };

  const handleCriarCargo = (formData: FormData) => {
    const name = formData.get("name") as string;
    const base_role = formData.get("base_role") as ManagedRole;
    if (!name.trim()) {
      toast.error("O nome do cargo é obrigatório.");
      return;
    }
    
    startTransition(async () => {
      const state = await criarCargo({ name, base_role });
      if (state?.ok) {
        toast.success("Cargo criado com sucesso!");
        setIsModalOpen(false);
        router.refresh();
      } else {
        toast.error(state?.error || "Erro ao criar cargo.");
      }
    });
  };

  const activeMeta = useMemo(
    () => ROLES.find((r) => r.role === activeRole)!,
    [activeRole],
  );

  return (
    <>
      <PageHeader
        title="Perfis de Acesso"
        subtitle="Defina o que cada papel vê no sistema, o escopo dos dados, e gerencie as credenciais deles."
      />

      <div className="mt-6">
      {/* Select de papel */}
      <div className="mb-6 max-w-xs">
        <label htmlFor="active-role-select" className="mb-2 block text-sm font-medium text-ink">
          Selecione o perfil para configurar:
        </label>
        <Select
          id="active-role-select"
          value={selectedOption}
          onChange={(e) => setSelectedOption(e.target.value)}
        >
          <optgroup label="Perfis base">
            {ROLES.filter(({ role }) => role !== "admin").map(({ role, label }) => (
              <option key={role} value={role}>
                {label}
              </option>
            ))}
          </optgroup>
          {cargos.length > 0 && (
            <optgroup label="Cargos personalizados">
              {cargos.map((c) => (
                <option key={c.id} value={`${c.baseRole}:${c.id}`}>
                  {c.nome}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
      </div>

      <Card>
        <CardBody>
          {/* Cabeçalho do papel */}
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-ink">{activeMeta.label}</h3>
              <p className="text-xs text-muted">{activeMeta.desc}</p>
            </div>
          </div>

          {/* Nota: admin é read-only (acesso total garantido pelo backend) */}
          {isAdminTab && (
            <div className="mb-5 flex items-start gap-2 rounded-xl border border-line bg-muted-surface p-3 text-xs text-muted">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <p>
                O administrador tem acesso total a todos os módulos. Estas
                configurações são somente leitura — o módulo{" "}
                <strong className="text-ink">Perfis de Acesso</strong> nunca pode
                ser desativado para o admin (evita bloqueio irreversível).
              </p>
            </div>
          )}

          {/* Opção Marcar Todos */}
          <div className="mb-3 flex items-center justify-end gap-2 px-1">
            <input
              id="select-all-modules"
              type="checkbox"
              checked={allChecked}
              disabled={isAdminTab}
              onChange={(e) => handleToggleAll(e.target.checked)}
              className="h-4 w-4 rounded border-line text-brand-500 focus:ring-brand-100 disabled:cursor-not-allowed"
            />
            <label
              htmlFor="select-all-modules"
              className="text-xs font-semibold text-muted hover:text-ink cursor-pointer select-none"
            >
              Marcar todos os módulos
            </label>
          </div>

          {/* Grade de módulos */}
          <div className="overflow-hidden rounded-xl border border-line">
            {/* Cabeçalho da grade */}
            <div className="hidden grid-cols-[1fr_auto_220px] items-center gap-4 border-b border-line bg-muted-surface px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted sm:grid">
              <span>Módulo</span>
              <span className="text-center">Ver</span>
              <span>Escopo dos dados</span>
            </div>

            <ul className="divide-y divide-line">
              {paginatedModules.map((module) => {
                const perm = current[module];
                const checkboxId = `view-${activeRole}-${module}`;
                const scopeId = `scope-${activeRole}-${module}`;
                return (
                  <li
                    key={module}
                    className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 sm:grid-cols-[1fr_auto_220px]"
                  >
                    <label
                      htmlFor={checkboxId}
                      className="text-sm font-medium text-ink"
                    >
                      {MODULE_LABELS[module]}
                    </label>

                    <div className="flex items-center justify-center">
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={perm.canView}
                        disabled={isAdminTab}
                        onChange={(e) => setCanView(module, e.target.checked)}
                        aria-label={`Ver ${MODULE_LABELS[module]}`}
                        className="h-5 w-5 rounded border-line text-brand-500 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-1">
                      <Select
                        id={scopeId}
                        aria-label={`Escopo de ${MODULE_LABELS[module]}`}
                        value={perm.scope}
                        disabled={isAdminTab || !perm.canView}
                        onChange={(e) =>
                          setScope(module, e.target.value as Scope)
                        }
                        className="disabled:cursor-not-allowed disabled:bg-muted-surface disabled:text-muted"
                      >
                        <option value="own">Só os dados dele</option>
                        <option value="all">Toda a plataforma</option>
                      </Select>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Controles de Paginação */}
            <div className="flex items-center justify-between border-t border-line bg-muted-surface px-4 py-3 sm:px-6">
              <div className="flex flex-1 justify-between sm:hidden">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Próximo
                </Button>
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs text-muted">
                    Mostrando <span className="font-semibold text-ink">{startIndex + 1}</span> a{" "}
                    <span className="font-semibold text-ink">
                      {Math.min(startIndex + ITEMS_PER_PAGE, MODULES.length)}
                    </span>{" "}
                    de <span className="font-semibold text-ink">{MODULES.length}</span> módulos
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Anterior
                  </Button>
                  {Array.from({ length: totalPages }).map((_, i) => {
                    const page = i + 1;
                    return (
                      <Button
                        key={page}
                        type="button"
                        variant={currentPage === page ? "primary" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </Button>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Próximo
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button
          type="button"
          variant="primary"
          disabled={pending}
          onClick={handleSave}
        >
          <Save className="h-4 w-4" />
          {pending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
      </div>

      <Card className="mt-6">
        <CardBody>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-ink">Cargos Personalizados Cadastrados</h3>
            <Button type="button" variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Cadastrar Cargo
            </Button>
          </div>
          
          {cargos.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-line">
              <ul className="divide-y divide-line">
                {cargos.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <span className="text-sm font-medium text-ink">{c.nome}</span>
                      <span className="ml-2 text-xs text-muted">
                        (herda de {c.baseRole === "medico" ? "Médico" : c.baseRole === "recepcao" ? "Recepção" : "Administrador"})
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted hover:text-red-600"
                      onClick={() => handleExcluirCargo(c.id, c.nome)}
                      disabled={pending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line p-8 text-center">
              <p className="text-sm text-muted">Nenhum cargo personalizado cadastrado ainda.</p>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Cadastrar Novo Cargo"
        subtitle="Crie um cargo personalizado e escolha de qual perfil ele herda as permissões."
      >
        <form action={handleCriarCargo} className="space-y-4">
          <Input
            id="name"
            name="name"
            label="Nome do Cargo"
            placeholder="Ex.: Gerente Financeiro"
            required
          />
          <Select
            id="base_role"
            name="base_role"
            label="Herda permissões de:"
            required
            defaultValue="recepcao"
          >
            {ROLES.map((r) => (
              <option key={r.role} value={r.role}>
                {r.label}
              </option>
            ))}
          </Select>
          <div className="pt-4 flex justify-end gap-2 border-t border-line mt-6">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
