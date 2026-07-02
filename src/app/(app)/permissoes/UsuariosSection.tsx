"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { criarCargo, atribuirCargo, definirSenha } from "@/lib/actions/usuarios";
import { BASE_ROLES, type Usuario, type Cargo } from "@/lib/data/usuarios.shared";

/** Valor do select de cargo para um usuário (cargo-base puro vs personalizado). */
function valorAtual(u: Usuario): string {
  return u.cargoId ? `cargo:${u.cargoId}` : `base:${u.roleBase}`;
}

export function UsuariosSection({
  usuarios,
  cargos,
}: {
  usuarios: Usuario[];
  cargos: Cargo[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingUser, setPendingUser] = useState<string | null>(null);

  // Modal: adicionar cargo
  const [cargoOpen, setCargoOpen] = useState(false);
  const [cargoNome, setCargoNome] = useState("");
  const [cargoBase, setCargoBase] = useState<"admin" | "medico" | "recepcao">(
    "medico",
  );

  // Modal: definir senha
  const [senhaUser, setSenhaUser] = useState<Usuario | null>(null);
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");

  function salvarCargo() {
    if (cargoNome.trim().length < 2) {
      toast.error("Informe o nome do cargo.");
      return;
    }
    startTransition(async () => {
      const res = await criarCargo({ name: cargoNome.trim(), base_role: cargoBase });
      if (res?.ok) {
        toast.success("Cargo criado.");
        setCargoOpen(false);
        setCargoNome("");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível criar o cargo.");
      }
    });
  }

  function trocarCargo(u: Usuario, value: string) {
    if (value === valorAtual(u)) return;
    setPendingUser(u.userId);
    startTransition(async () => {
      const res = await atribuirCargo({ userId: u.userId, value });
      setPendingUser(null);
      if (res?.ok) {
        toast.success(`Cargo de ${u.nome} atualizado.`);
        router.refresh();
      } else {
        toast.error(res?.error ?? "Não foi possível atribuir o cargo.");
      }
    });
  }

  function salvarSenha() {
    if (!senhaUser) return;
    if (senha !== senha2) {
      toast.error("A confirmação não confere com a nova senha.");
      return;
    }
    startTransition(async () => {
      const res = await definirSenha({ userId: senhaUser.userId, newPassword: senha });
      if (res?.ok) {
        toast.success(`Senha de ${senhaUser.nome} atualizada.`);
        setSenhaUser(null);
        setSenha("");
        setSenha2("");
      } else {
        toast.error(res?.error ?? "Não foi possível atualizar a senha.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Defina o cargo e a senha de cada usuário (pacientes não entram como
          usuário).
        </p>
        <Button variant="outline" size="sm" onClick={() => setCargoOpen(true)}>
          <Plus className="h-4 w-4" /> Adicionar cargo
        </Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-muted-surface text-left text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Usuário</th>
              <th className="px-4 py-3 font-medium">Cargo</th>
              <th className="px-4 py-3 font-medium">Alterar cargo</th>
              <th className="px-4 py-3 font-medium">Senha</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  Nenhum usuário (fora pacientes) nesta clínica.
                </td>
              </tr>
            ) : (
              usuarios.map((u) => (
                <tr key={u.userId} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-500 text-xs font-bold text-white">
                        {u.nome.charAt(0)}
                      </span>
                      <span className="font-medium text-ink">{u.nome}</span>
                      {!u.ativo && <Badge status="danger">Inativo</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge status="active">{u.cargoLabel}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      aria-label={`Cargo de ${u.nome}`}
                      value={valorAtual(u)}
                      disabled={pending && pendingUser === u.userId}
                      onChange={(e) => trocarCargo(u, e.target.value)}
                      className="min-w-44"
                    >
                      <optgroup label="Cargos-base">
                        {BASE_ROLES.map((b) => (
                          <option key={b.value} value={`base:${b.value}`}>
                            {b.label}
                          </option>
                        ))}
                      </optgroup>
                      {cargos.length > 0 && (
                        <optgroup label="Cargos personalizados">
                          {cargos.map((c) => (
                            <option key={c.id} value={`cargo:${c.id}`}>
                              {c.nome}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSenhaUser(u);
                        setSenha("");
                        setSenha2("");
                      }}
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Definir senha
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {/* Modal: adicionar cargo */}
      <Modal
        open={cargoOpen}
        onClose={() => setCargoOpen(false)}
        title="Adicionar cargo"
        subtitle="Um cargo herda o acesso de um cargo-base (Admin/Médico/Recepção)"
        className="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCargoOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarCargo} disabled={pending}>
              {pending ? "Salvando..." : "Criar cargo"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nome do cargo"
            placeholder="Ex.: Fisioterapeuta, Enfermagem"
            value={cargoNome}
            onChange={(e) => setCargoNome(e.target.value)}
          />
          <Select
            label="Herda o acesso de"
            value={cargoBase}
            onChange={(e) =>
              setCargoBase(e.target.value as "admin" | "medico" | "recepcao")
            }
          >
            {BASE_ROLES.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted">
            O acesso real (o que o usuário vê) segue o cargo-base escolhido. O
            nome é só o rótulo exibido.
          </p>
        </div>
      </Modal>

      {/* Modal: definir senha */}
      <Modal
        open={!!senhaUser}
        onClose={() => setSenhaUser(null)}
        title="Definir senha"
        subtitle={senhaUser ? `Usuário: ${senhaUser.nome}` : ""}
        className="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSenhaUser(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarSenha} disabled={pending}>
              {pending ? "Salvando..." : "Salvar senha"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            type="password"
            label="Nova senha"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          <Input
            type="password"
            label="Confirmar nova senha"
            autoComplete="new-password"
            value={senha2}
            onChange={(e) => setSenha2(e.target.value)}
          />
          <p className="text-xs text-muted">
            A senha vale imediatamente e respeita a política de senha da clínica.
          </p>
        </div>
      </Modal>
    </div>
  );
}
