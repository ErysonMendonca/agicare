"use client";

import { type ReactNode } from "react";
import { Plus, Pencil, Trash2, Check, Minus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

/**
 * Blocos de UI compartilhados pelas 7 abas-filhas do editor de produto.
 * Padronizam cabeçalho (título + botão "Novo"), a moldura da tabela, o estado
 * vazio e o badge de Ativo/Inativo — mantendo aparência e a11y consistentes.
 */

/** Cabeçalho da aba: título, descrição e botão "+ Novo". */
export function TabHeader({
  title,
  description,
  onNew,
  disabled,
}: {
  title: string;
  description?: string;
  onNew: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      <Button variant="primary" onClick={onNew} disabled={disabled}>
        <Plus className="h-4 w-4" /> Novo
      </Button>
    </div>
  );
}

/** Moldura de tabela (Card + scroll horizontal + cabeçalho de colunas). */
export function TabTable({
  headers,
  colSpan,
  isEmpty,
  emptyLabel,
  children,
}: {
  headers: string[];
  colSpan: number;
  isEmpty: boolean;
  emptyLabel: string;
  children: ReactNode;
}) {
  return (
    <Card className="mt-4 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted">
              {headers.map((h) => (
                <th key={h} className="px-5 py-3 font-medium">
                  {h}
                </th>
              ))}
              <th className="px-5 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isEmpty ? (
              <tr>
                <td
                  colSpan={colSpan + 1}
                  className="px-5 py-10 text-center text-muted"
                >
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Célula de ações (editar/remover) padronizada. */
export function RowActions({
  onEdit,
  onRemove,
  disabled,
  label,
}: {
  onEdit: () => void;
  onRemove: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <td className="px-5 py-3 text-right">
      <div className="inline-flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={onEdit}
          disabled={disabled}
          aria-label={`Editar ${label}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remover ${label}`}
        >
          <Trash2 className="h-4 w-4 text-status-danger" />
        </Button>
      </div>
    </td>
  );
}

/** Badge Ativo/Inativo. */
export function AtivoBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <Badge status="ok">
        <Check className="h-3 w-3" /> Ativo
      </Badge>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted-surface px-2.5 py-0.5 text-xs font-medium text-muted">
      <Minus className="h-3 w-3" /> Inativo
    </span>
  );
}
