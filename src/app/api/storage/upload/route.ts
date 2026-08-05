// Upload de arquivo a partir do browser. Substitui o
// `supabase.storage.from(bucket).upload()`, que no Supabase era protegido
// por RLS de Storage; aqui a proteção é feita aqui: exige sessão válida e
// obriga o caminho a começar pela clínica ativa, para um usuário não gravar
// (nem sobrescrever) arquivo de outra clínica.
import { NextResponse } from "next/server";
import { lerSessao } from "@/lib/db/session";
import { criarStorage } from "@/lib/db/storage";

const BUCKETS = new Set(["prontuarios", "protetico", "anamnese", "branding", "estoque"]);
const TAMANHO_MAX = 25 * 1024 * 1024; // 25 MB

export async function POST(req: Request) {
  const sessao = await lerSessao();
  if (!sessao) {
    return NextResponse.json(
      { data: null, error: { message: "Sessão expirada." } }, { status: 401 });
  }

  const fd = await req.formData();
  const bucket = String(fd.get("bucket") ?? "");
  const caminho = String(fd.get("path") ?? "");
  const upsert = String(fd.get("upsert") ?? "0") === "1";
  const arquivo = fd.get("file");

  if (!BUCKETS.has(bucket)) {
    return NextResponse.json(
      { data: null, error: { message: `Bucket não permitido: ${bucket}` } }, { status: 400 });
  }
  if (!(arquivo instanceof File)) {
    return NextResponse.json(
      { data: null, error: { message: "Arquivo ausente." } }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAX) {
    return NextResponse.json(
      { data: null, error: { message: "Arquivo maior que 25 MB." } }, { status: 413 });
  }

  // Isolamento: o caminho precisa estar sob a clínica ativa. Era o que a RLS
  // de Storage garantia pelo prefixo do nome do objeto.
  const clinic = sessao.activeClinicId;
  const caminhoFinal = clinic && !caminho.startsWith(`${clinic}/`)
    ? `${clinic}/${caminho.replace(/^\/+/, "")}`
    : caminho;

  const { data, error } = await criarStorage()
    .from(bucket)
    .upload(caminhoFinal, arquivo, { upsert });

  if (error) return NextResponse.json({ data: null, error }, { status: 400 });
  return NextResponse.json({ data, error: null });
}
