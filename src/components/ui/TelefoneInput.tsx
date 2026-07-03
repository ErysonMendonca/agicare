"use client";

import { useState, type ChangeEvent } from "react";
import { Input, type InputProps } from "@/components/ui/Input";
import { formatTelefone } from "@/lib/telefone";

/**
 * Input de telefone com máscara adaptativa "(XX) X XXXX-XXXX" (celular) ou
 * "(XX) XXXX-XXXX" (fixo). Funciona controlado (passe `value`+`onChange`) ou
 * não-controlado (passe `defaultValue`; submete via `name` no FormData). Em
 * ambos os casos o valor exibido/enviado já vai mascarado.
 */
export function TelefoneInput({
  value,
  defaultValue,
  onChange,
  ...props
}: InputProps) {
  const controlado = value !== undefined;
  const [interno, setInterno] = useState(() =>
    formatTelefone(String(defaultValue ?? "")),
  );
  const exibido = controlado ? formatTelefone(String(value ?? "")) : interno;

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const mascarado = formatTelefone(e.target.value);
    if (!controlado) setInterno(mascarado);
    if (onChange) {
      e.target.value = mascarado;
      onChange(e);
    }
  }

  return (
    <Input
      {...props}
      type="tel"
      inputMode="tel"
      value={exibido}
      onChange={handleChange}
    />
  );
}
