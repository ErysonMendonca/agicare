// Encerra a sessão apagando o cookie.
import { NextResponse } from "next/server";
import { criarAuth } from "@/lib/db/auth";

export async function POST() {
  await criarAuth().signOut();
  return NextResponse.json({ ok: true });
}
