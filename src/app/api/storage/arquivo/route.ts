// Download de arquivo. No Supabase os buckets tinham URL própria protegida
// por RLS; aqui os arquivos ficam FORA de public/ e só saem por esta rota,
// que exige sessão e confere se o arquivo pertence à clínica ativa.
import { NextResponse } from "next/server";
import { lerSessao } from "@/lib/db/session";
import { lerArquivo } from "@/lib/db/storage";

const TIPOS: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg",
  jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  svg: "image/svg+xml", txt: "text/plain", csv: "text/csv",
  doc: "application/msword", xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  stl: "model/stl", zip: "application/zip",
};

export async function GET(req: Request) {
  const sessao = await lerSessao();
  if (!sessao) return new NextResponse("Sessão expirada.", { status: 401 });

  const url = new URL(req.url);
  const bucket = url.searchParams.get("bucket") ?? "";
  const caminho = url.searchParams.get("path") ?? "";
  if (!bucket || !caminho) return new NextResponse("Parâmetros ausentes.", { status: 400 });

  // Isolamento: arquivo de outra clínica não é servido. Arquivos legados sem
  // prefixo de clínica continuam acessíveis (não havia prefixo na época).
  const clinic = sessao.activeClinicId;
  const temPrefixoDeClinica = /^[0-9a-f-]{36}\//i.test(caminho);
  if (clinic && temPrefixoDeClinica && !caminho.startsWith(`${clinic}/`)) {
    return new NextResponse("Arquivo não encontrado.", { status: 404 });
  }

  try {
    const buf = await lerArquivo(bucket, caminho);
    const ext = caminho.split(".").pop()?.toLowerCase() ?? "";
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "content-type": TIPOS[ext] ?? "application/octet-stream",
        "content-disposition": `inline; filename="${caminho.split("/").pop()}"`,
        "cache-control": "private, max-age=60",
      },
    });
  } catch {
    return new NextResponse("Arquivo não encontrado.", { status: 404 });
  }
}
