// ════════════════════════════════════════════════════════════════
// Substituto do Supabase Storage: arquivos em disco local.
//
// Os anexos (prontuário digitalizado, arquivos de protético, logo da
// clínica) ficavam em buckets do Supabase, com RLS por prefixo de clínica.
// Aqui vão para uma pasta local, mantendo o MESMO esquema de caminho
// (`<clinic_id>/<...>`) para não mudar o que está gravado no banco.
//
// Server-only. Para upload a partir do browser existe a rota
// /api/storage/upload, que valida a sessão antes de gravar.
// ════════════════════════════════════════════════════════════════

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";

/** Raiz dos arquivos. Fora de `public/` — o acesso passa por rota autenticada. */
function raiz(): string {
  return process.env.STORAGE_DIR ?? resolve(process.cwd(), "storage");
}

/**
 * Resolve o caminho físico, barrando escape de diretório. Sem isto, um
 * caminho como "../../.env" gravaria fora da pasta de storage.
 */
function caminhoFisico(bucket: string, caminho: string): string {
  if (!/^[\w-]+$/.test(bucket)) throw new Error(`Bucket inválido: ${bucket}`);
  const limpo = normalize(caminho).replace(/^([/\\]|\.\.([/\\]|$))+/, "");
  const base = join(raiz(), bucket);
  const alvo = resolve(base, limpo);
  if (alvo !== base && !alvo.startsWith(base + sep)) {
    throw new Error("Caminho de arquivo fora do storage.");
  }
  return alvo;
}

export type RespostaStorage<T> = { data: T; error: { message: string } | null };

type Enviavel = File | Blob | Buffer | ArrayBuffer | Uint8Array;

async function paraBuffer(f: Enviavel): Promise<Buffer> {
  if (Buffer.isBuffer(f)) return f;
  if (f instanceof Uint8Array) return Buffer.from(f);
  if (f instanceof ArrayBuffer) return Buffer.from(new Uint8Array(f));
  return Buffer.from(new Uint8Array(await (f as Blob).arrayBuffer()));
}

export function criarStorage() {
  return {
    from(bucket: string) {
      return {
        async upload(
          caminho: string,
          arquivo: Enviavel,
          // cacheControl é aceito e ignorado: era header de CDN do Supabase
          // Storage; aqui o cache é definido pela rota que serve o arquivo.
          opts?: { upsert?: boolean; contentType?: string; cacheControl?: string },
        ): Promise<RespostaStorage<{ path: string } | null>> {
          try {
            const fisico = caminhoFisico(bucket, caminho);
            if (!opts?.upsert) {
              // Mesmo comportamento do Supabase: sem upsert, não sobrescreve.
              const existe = await readFile(fisico).then(() => true).catch(() => false);
              if (existe) {
                return { data: null, error: { message: "The resource already exists" } };
              }
            }
            await mkdir(dirname(fisico), { recursive: true });
            await writeFile(fisico, await paraBuffer(arquivo));
            return { data: { path: caminho }, error: null };
          } catch (e) {
            return { data: null, error: { message: (e as Error).message } };
          }
        },

        async download(caminho: string): Promise<RespostaStorage<Blob | null>> {
          try {
            const buf = await readFile(caminhoFisico(bucket, caminho));
            return { data: new Blob([new Uint8Array(buf)]), error: null };
          } catch (e) {
            return { data: null, error: { message: (e as Error).message } };
          }
        },

        async remove(caminhos: string[]): Promise<RespostaStorage<unknown[]>> {
          const erros: string[] = [];
          for (const c of caminhos) {
            try { await unlink(caminhoFisico(bucket, c)); }
            catch (e) { erros.push(`${c}: ${(e as Error).message}`); }
          }
          return {
            data: [],
            error: erros.length ? { message: erros.join("; ") } : null,
          };
        },

        /**
         * URL para baixar o arquivo. Como o storage NÃO é público, aponta para
         * a rota autenticada em vez de um link direto e permanente.
         */
        getPublicUrl(caminho: string): { data: { publicUrl: string } } {
          const qs = new URLSearchParams({ bucket, path: caminho });
          return { data: { publicUrl: `/api/storage/arquivo?${qs}` } };
        },

        async createSignedUrl(
          caminho: string,
          _expiraEmSeg?: number,
        ): Promise<RespostaStorage<{ signedUrl: string } | null>> {
          const qs = new URLSearchParams({ bucket, path: caminho });
          return {
            data: { signedUrl: `/api/storage/arquivo?${qs}` },
            error: null,
          };
        },

        /** Versão em lote. A rota exige sessão, então não há URL a assinar. */
        async createSignedUrls(
          caminhos: string[],
          _expiraEmSeg?: number,
        ): Promise<RespostaStorage<{ path: string; signedUrl: string }[]>> {
          return {
            data: caminhos.map((path) => ({
              path,
              signedUrl: `/api/storage/arquivo?${new URLSearchParams({ bucket, path })}`,
            })),
            error: null,
          };
        },
      };
    },
  };
}

export type Storage = ReturnType<typeof criarStorage>;

/** Lê um arquivo cru (usado pela rota de download). */
export async function lerArquivo(
  bucket: string,
  caminho: string,
): Promise<Buffer> {
  return readFile(caminhoFisico(bucket, caminho));
}
