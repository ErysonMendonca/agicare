"use client";

import { createContext, useContext, type ReactNode } from "react";

// ════════════════════════════════════════════════════════════════
// Contexto de PAPEL para as ações de documento do prontuário.
//
// Regra de negócio: quando quem acessa é o MÉDICO, os documentos do
// prontuário NÃO podem exibir o botão "Editar" em nenhum dos menus. O
// médico visualiza, imprime e cancela — mas não reabre o documento para
// edição. O gate é injetado uma única vez em `SecaoClinica` (server sabe o
// papel) e consumido por `DocumentActions`, evitando espalhar a regra por
// cada tela.
//
// Sem provider (ex.: fila/recepção), `useOcultarEdicao()` devolve `false`
// (comportamento inalterado — o botão continua aparecendo).
// ════════════════════════════════════════════════════════════════

const OcultarEdicaoContext = createContext(false);

export function PapelDocumentoProvider({
  ocultarEdicao,
  children,
}: {
  ocultarEdicao: boolean;
  children: ReactNode;
}) {
  return (
    <OcultarEdicaoContext.Provider value={ocultarEdicao}>
      {children}
    </OcultarEdicaoContext.Provider>
  );
}

/** true quando o botão "Editar" dos documentos deve ficar oculto (médico). */
export function useOcultarEdicao(): boolean {
  return useContext(OcultarEdicaoContext);
}
