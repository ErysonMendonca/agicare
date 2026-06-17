"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Save, Info } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { savePermissions } from "@/lib/actions/permissions";
import {
  MODULES,
  MODULE_LABELS,
  type ModuleSlug,
  type ModulePermission,
  type PermissionRow,
  type Scope,
} from "@/lib/permissions.shared";
import type { Role } from "@/lib/auth";

// Papéis na ordem das abas + rótulo/descrição PT-BR.
const ROLES: { role: Role; label: string; desc: string }[] = [
  { role: "admin", label: "Administrador", desc: "Acesso total à plataforma" },
  { role: "medico", label: "Médico", desc: "Atendimento e prontuário" },
  { role: "recepcao", label: "Recepção", desc: "Fila, agenda e cadastro" },
  { role: "paciente", label: "Paciente", desc: "Não usa o painel interno" },
];

type Matrix = Record<Role, Record<ModuleSlug, ModulePermission>>;

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
    if (base[r.role] && base[r.role][r.module]) {
      base[r.role][r.module] = { canView: r.canView, scope: r.scope };
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
}: {
  initialRows: PermissionRow[];
}) {
  const [matrix, setMatrix] = useState<Matrix>(() => buildMatrix(initialRows));
  const [activeRole, setActiveRole] = useState<Role>("admin");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const isAdminTab = activeRole === "admin";

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

  const current = matrix[activeRole];
  const activeMeta = useMemo(
    () => ROLES.find((r) => r.role === activeRole)!,
    [activeRole],
  );

  return (
    <>
      <PageHeader
        title="Perfis de Acesso"
        subtitle="Defina o que cada papel vê no sistema e o escopo dos dados (só os próprios registros ou toda a plataforma)."
      />

      {/* Abas por papel */}
      <div
        className="mb-6 flex flex-wrap gap-2"
        role="tablist"
        aria-label="Papéis"
      >
        {ROLES.map(({ role, label }) => (
          <button
            key={role}
            type="button"
            role="tab"
            aria-selected={activeRole === role}
            onClick={() => setActiveRole(role)}
            className={
              activeRole === role
                ? "rounded-full bg-brand-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm"
                : "rounded-full px-4 py-1.5 text-sm font-medium text-muted hover:bg-canvas hover:text-ink"
            }
          >
            {label}
          </button>
        ))}
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

          {/* Grade de módulos */}
          <div className="overflow-hidden rounded-xl border border-line">
            {/* Cabeçalho da grade */}
            <div className="hidden grid-cols-[1fr_auto_220px] items-center gap-4 border-b border-line bg-muted-surface px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted sm:grid">
              <span>Módulo</span>
              <span className="text-center">Ver</span>
              <span>Escopo dos dados</span>
            </div>

            <ul className="divide-y divide-line">
              {MODULES.map((module) => {
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
    </>
  );
}
