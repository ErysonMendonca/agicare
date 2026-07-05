"use client";

import { Check as CheckIcon } from "lucide-react";

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
      {children}
    </h3>
  );
}

export function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
      <input type="hidden" name={name} value="false" />
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-line text-brand-500 accent-brand-500 focus:ring-2 focus:ring-brand-100"
      />
      {label}
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={[
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1",
          checked ? "bg-brand-500" : "bg-line",
        ].join(" ")}
      >
        <span
          className={[
            "inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          ].join(" ")}
        >
          {checked && <CheckIcon className="h-3 w-3 text-brand-500" />}
        </span>
      </button>
      <span className="text-sm font-medium text-ink">{label}</span>
    </div>
  );
}

export function CheckboxGroup({
  legend,
  options,
  selected,
  onChange,
}: {
  legend: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(label: string, checked: boolean) {
    if (checked) {
      if (!selected.some((s) => s.toLowerCase() === label.toLowerCase())) {
        onChange([...selected, label]);
      }
    } else {
      onChange(selected.filter((s) => s.toLowerCase() !== label.toLowerCase()));
    }
  }

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium text-ink">{legend}</legend>
      {options.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted">
          Nenhuma opção cadastrada em Configurações.
        </p>
      ) : (
        <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
          {options.map((label) => {
            const checked = selected.some(
              (s) => s.toLowerCase() === label.toLowerCase(),
            );
            return (
              <label
                key={label}
                className="flex cursor-pointer items-center gap-2 text-sm text-ink"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggle(label, e.target.checked)}
                  className="h-4 w-4 rounded border-line text-brand-500 accent-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                {label}
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
