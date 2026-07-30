/**
 * Backend configurado?
 *
 * Antes indicava se as chaves do Supabase existiam: sem elas o app rodava em
 * "modo demo", pulando upload de arquivo e o refresh de sessão. Com MySQL não
 * há chave pública a inspecionar — e o app não funciona sem banco de qualquer
 * forma — então a resposta é sempre `true`.
 *
 * A função foi mantida (mesmo nome) porque é chamada de CLIENT Components, que
 * não podem ler as variáveis MYSQL_* (não são NEXT_PUBLIC, e credencial de
 * banco não deve ir para o browser). Os quatro pontos de chamada seguem
 * funcionando sem alteração.
 */
export function isSupabaseConfigured(): boolean {
  return true;
}
