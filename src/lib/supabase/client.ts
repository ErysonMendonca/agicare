// ════════════════════════════════════════════════════════════════
// Cliente de BROWSER.
//
// O navegador NÃO fala com o MySQL — credencial de banco não pode sair do
// servidor. Felizmente o projeto nunca consultou o banco direto do browser:
// os 4 arquivos que importam daqui usam só duas coisas, e ambas passam por
// rota no servidor:
//
//   · auth.refreshSession()  → POST /api/auth/refresh (reemite o cookie)
//   · storage.from().upload() → POST /api/storage/upload (valida a sessão
//                                antes de gravar o arquivo)
//
// `.from()` existe apenas para falhar com mensagem clara caso alguém tente
// consultar o banco de um Client Component — em vez de erro obscuro de
// runtime, diz o que fazer (mover para Server Component ou Server Action).
// ════════════════════════════════════════════════════════════════

type RespostaUpload = { data: { path: string } | null; error: { message: string } | null };

export function createClient() {
  return {
    auth: {
      async refreshSession() {
        const r = await fetch("/api/auth/refresh", { method: "POST" });
        if (!r.ok) return { data: { user: null }, error: { message: "Falha ao renovar a sessão." } };
        return { data: await r.json(), error: null };
      },
      async signOut() {
        await fetch("/api/auth/signout", { method: "POST" });
        return { error: null };
      },
      async getUser() {
        const r = await fetch("/api/auth/user");
        if (!r.ok) return { data: { user: null }, error: null };
        return { data: await r.json(), error: null };
      },
    },

    storage: {
      from(bucket: string) {
        return {
          async upload(
            caminho: string,
            arquivo: File | Blob,
            opts?: { upsert?: boolean },
          ): Promise<RespostaUpload> {
            const fd = new FormData();
            fd.append("bucket", bucket);
            fd.append("path", caminho);
            fd.append("upsert", opts?.upsert ? "1" : "0");
            fd.append("file", arquivo);
            const r = await fetch("/api/storage/upload", { method: "POST", body: fd });
            const json = (await r.json().catch(() => null)) as RespostaUpload | null;
            if (!r.ok) {
              return {
                data: null,
                error: { message: json?.error?.message ?? `Falha no upload (HTTP ${r.status}).` },
              };
            }
            return json ?? { data: null, error: { message: "Resposta inválida do upload." } };
          },

          getPublicUrl(caminho: string) {
            const qs = new URLSearchParams({ bucket, path: caminho });
            return { data: { publicUrl: `/api/storage/arquivo?${qs}` } };
          },

          async remove(caminhos: string[]) {
            const r = await fetch("/api/storage/remover", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ bucket, paths: caminhos }),
            });
            if (!r.ok) return { data: [], error: { message: "Falha ao remover arquivo." } };
            return { data: [], error: null };
          },
        };
      },
    },

    from(tabela: string): never {
      throw new Error(
        `Consulta ao banco a partir do browser não é possível com MySQL ` +
        `(tabela "${tabela}"). Mova a leitura para um Server Component ou a ` +
        `escrita para uma Server Action, que usam @/lib/supabase/server.`,
      );
    },
  };
}
