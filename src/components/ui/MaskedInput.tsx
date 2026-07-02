"use client";

import { useState, type ChangeEvent } from "react";
import { Input, type InputProps } from "@/components/ui/Input";
import { formatCpf, formatCnpj, formatCep, formatCns } from "@/lib/documentos";

/**
 * Input com máscara de digitação genérica. Recebe uma função `format` (de
 * `@/lib/documentos` ou `@/lib/telefone`) e aplica no `onChange`. Funciona
 * controlado (passe `value`+`onChange`) ou não-controlado (passe `defaultValue`
 * e submeta via `name`). Em ambos, o valor exibido/enviado já vai mascarado.
 * Espelha o comportamento do `TelefoneInput`.
 */
export function MaskedInput({
  format,
  value,
  defaultValue,
  onChange,
  inputMode = "numeric",
  ...props
}: InputProps & { format: (v: string) => string }) {
  const controlado = value !== undefined;
  const [interno, setInterno] = useState(() =>
    format(String(defaultValue ?? "")),
  );
  const exibido = controlado ? format(String(value ?? "")) : interno;

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const mascarado = format(e.target.value);
    if (!controlado) setInterno(mascarado);
    if (onChange) {
      e.target.value = mascarado;
      onChange(e);
    }
  }

  return (
    <Input
      {...props}
      inputMode={inputMode}
      value={exibido}
      onChange={handleChange}
    />
  );
}

/** Atalhos por tipo de documento — mantêm os call-sites enxutos. */
export const CpfInput = (props: InputProps) => (
  <MaskedInput format={formatCpf} {...props} />
);
export const CnpjInput = (props: InputProps) => (
  <MaskedInput format={formatCnpj} {...props} />
);
export const CepInput = (props: InputProps) => (
  <MaskedInput format={formatCep} {...props} />
);
export const CnsInput = (props: InputProps) => (
  <MaskedInput format={formatCns} {...props} />
);
