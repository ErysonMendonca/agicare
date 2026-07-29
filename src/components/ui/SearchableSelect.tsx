"use client";

import { useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
};

export interface SearchableSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * Select "digitável": um combobox que sempre ordena as opções em ordem
 * alfabética (pt-BR) e permite filtrar digitando, ao contrário do `<select>`
 * nativo (que só faz busca por primeira letra). Mesma API visual do `Select`
 * (label/error), reaproveitando o padrão de combobox já usado no Topbar.
 */
export function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Digite para buscar...",
  error,
  disabled,
  id,
  className,
}: SearchableSelectProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // Ordem alfabética sempre, independente de como a lista chega do catálogo.
  const ordenadas = useMemo(
    () =>
      [...options].sort((a, b) =>
        a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }),
      ),
    [options],
  );

  const selecionada = useMemo(
    () => ordenadas.find((o) => o.value === value) ?? null,
    [ordenadas, value],
  );

  const filtradas = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    if (!q) return ordenadas;
    return ordenadas.filter((o) => o.label.toLocaleLowerCase("pt-BR").includes(q));
  }, [ordenadas, query]);

  const escolher = (opt: SearchableSelectOption) => {
    onChange(opt.value);
    setQuery("");
    setOpen(false);
  };

  const limpar = () => {
    onChange("");
    setQuery("");
    inputRef.current?.focus();
  };

  const listboxId = id ? `${id}-listbox` : undefined;

  const input = (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        disabled={disabled}
        // Enquanto aberto/digitando mostra a busca; fechado, mostra o rótulo selecionado.
        value={open ? query : (selecionada?.label ?? "")}
        placeholder={open ? placeholder : "Selecione..."}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(0);
        }}
        onBlur={() => {
          // Atraso para permitir o clique numa opção antes do menu fechar.
          window.setTimeout(() => setOpen(false), 120);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
            return;
          }
          if (!filtradas.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % filtradas.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + filtradas.length) % filtradas.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const alvo = filtradas[active] ?? filtradas[0];
            if (alvo) escolher(alvo);
          }
        }}
        className={cn(
          "h-10 w-full rounded-lg border border-line bg-white pl-9 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100",
          selecionada && !disabled ? "pr-8" : "pr-3",
          error && "border-red-500 focus:border-red-500 focus:ring-red-100",
          className,
        )}
      />
      {selecionada && !disabled && (
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={limpar}
          aria-label="Limpar seleção"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted transition-colors hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg"
        >
          {filtradas.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">Nenhum resultado encontrado.</li>
          ) : (
            filtradas.map((opt, i) => (
              <li key={opt.value} role="option" aria-selected={opt.value === value}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => escolher(opt)}
                  className={cn(
                    "flex w-full px-3 py-2 text-left text-sm transition-colors",
                    i === active
                      ? "bg-brand-50 text-brand-700"
                      : "text-ink hover:bg-muted-surface",
                    opt.value === value && "font-medium",
                  )}
                >
                  {opt.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );

  const errEl = error ? (
    <span className="mt-1 block text-xs text-red-500 font-medium">{error}</span>
  ) : null;

  if (!label) {
    return (
      <span className="block">
        {input}
        {errEl}
      </span>
    );
  }
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {input}
      {errEl}
    </label>
  );
}
