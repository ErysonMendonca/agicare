// Remoção de arquivo pelo browser. Mesma proteção do upload: exige sessão e
// só deixa apagar dentro da clínica ativa.
import { NextResponse } from "next/server";
import { lerSessao } from "@/lib/db/session";
import { criarStorage } from "@/lib/db/storage";

export async function POST(req: Request) {
  const sessao = await lerSessao();
  if (!sessao) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const { bucket, paths } = (await req.json().catch(() => ({}))) as {
    bucket?: string; paths?: string[];
  };
  if (!bucket || !Array.isArray(paths) || paths.length === 0) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const clinic = sessao.activeClinicId;
  const permitidos = paths.filter((p) => {
    const temPrefixo = /^[0-9a-f-]{36}\//i.test(p);
    return !clinic || !temPrefixo || p.startsWith(`${clinic}/`);
  });

  const { error } = await criarStorage().from(bucket).remove(permitidos);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
