import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/PageHeader";
import { requireUser } from "@/lib/auth";
import { getMyAccount } from "@/lib/data/account";
import { MinhaContaClient } from "./MinhaContaClient";

/**
 * "Minha Conta" — tela self-service acessível a QUALQUER usuário autenticado
 * (não é módulo com permissão). Exige apenas sessão; o papel não importa aqui.
 * Ponto de integração: os dados vêm de getMyAccount() (backend) e as mutações de
 * @/lib/actions/account (updateMyAccount, changeUsername, changePassword).
 */
export default async function MinhaContaPage() {
  await requireUser();
  const acc = await getMyAccount();

  // Sem conta carregável (ex.: perfil inconsistente) → volta ao início.
  if (!acc) redirect("/");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Minha Conta"
        subtitle="Atualize seus dados, seu login e sua senha."
      />
      <MinhaContaClient acc={acc} />
    </div>
  );
}
