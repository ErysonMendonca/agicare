"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EditarPacienteModal } from "../EditarPacienteModal";

/**
 * Gatilho client-side para editar o cadastro a partir da ficha (server component).
 * Abre o EditarPacienteModal pré-preenchido; ao salvar, refaz os dados da página
 * (router.refresh) para a ficha refletir a edição.
 */
export function EditarCadastroButton({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" /> Editar cadastro
      </Button>

      {open && (
        <EditarPacienteModal
          key={patientId}
          patientId={patientId}
          onClose={() => setOpen(false)}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}
