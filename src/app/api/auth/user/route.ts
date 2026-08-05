// Usuário da sessão atual, para o Client Component que precisa saber quem
// está logado. Devolve apenas id/e-mail/clínica ativa — nunca o hash da senha.
import { NextResponse } from "next/server";
import { criarAuth } from "@/lib/db/auth";

export async function GET() {
  const { data } = await criarAuth().getUser();
  return NextResponse.json({ user: data.user });
}
