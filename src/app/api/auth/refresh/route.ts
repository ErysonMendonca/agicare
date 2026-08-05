// Reemite o cookie de sessão. Substitui `supabase.auth.refreshSession()`,
// que o browser chamava depois do login para o token novo carregar a
// clínica ativa. Precisa ser Route Handler: Server Component não grava cookie.
import { NextResponse } from "next/server";
import { criarAuth } from "@/lib/db/auth";

export async function POST() {
  const { data, error } = await criarAuth().refreshSession();
  if (error) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: data.user });
}
