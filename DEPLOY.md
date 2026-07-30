# Deploy em VPS

O sistema roda sobre MySQL — não há mais nenhuma dependência do Supabase.
Este documento lista o que é necessário para subir, e o que **ainda não foi
verificado**, para você não descobrir em produção.

## Requisitos

| | |
|---|---|
| Node | 20+ (o projeto usa Next.js 16) |
| Banco | MySQL 8.0.16+ ou MariaDB 10.4+ |
| Proxy | Nginx/Caddy com **HTTPS** — ver a seção de TLS abaixo |

## Passos

**1. Banco**

```bash
mysql -u root -p --default-character-set=utf8mb4 < mysql/agicare_mysql.sql
```

Crie um usuário próprio para a aplicação em vez de usar `root`:

```sql
CREATE USER 'agicare'@'localhost' IDENTIFIED BY 'senha-forte';
GRANT SELECT, INSERT, UPDATE, DELETE ON agicare.* TO 'agicare'@'localhost';
```

`SELECT/INSERT/UPDATE/DELETE` é tudo que a aplicação usa — ela não cria nem
altera tabelas em tempo de execução.

**2. Variáveis**

Copie `.env.example` para `.env.local` e preencha. Os dois obrigatórios:

```bash
# 32+ caracteres. Sem ele o app NÃO SOBE fora de desenvolvimento.
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

- `AUTH_SECRET` — assina o cookie de sessão
- `MYSQL_*` — conexão

**Não defina `NODE_ENV`.** Se ficar como `development` no servidor, o cookie
de sessão perde o `secure` e a exigência do `AUTH_SECRET` é desligada.

**3. Build e start**

```bash
npm ci
npm run build
npm start
```

Use um supervisor (systemd, PM2) para reiniciar em caso de queda.

**4. Trocar a senha do admin**

O `.sql` cria `admin@agicare.local` com senha `Agicare@2026`, em texto claro
no arquivo. Troque no primeiro acesso.

## HTTPS é obrigatório

O cookie de sessão vai com `secure` fora de desenvolvimento, ou seja, o
navegador só o envia por HTTPS. **Em HTTP puro o login não funciona** — e
isso é intencional: mandar o cookie de sessão em claro é pior do que não
logar. Ponha um Nginx/Caddy com certificado (Let's Encrypt) na frente.

## Arquivos anexados

`STORAGE_DIR` (padrão `./storage`) guarda prontuário digitalizado, anexos de
protético e logo da clínica. Precisa ser:

- **persistente** — se o deploy recria o diretório, os anexos desaparecem;
- **gravável** pelo usuário do processo;
- **incluído no backup**, junto com o dump do MySQL. O banco guarda só o
  caminho do arquivo; perder a pasta é perder o anexo.

## Limitações conhecidas

**Uma instância só.** O rate-limit de login é em memória
(`src/lib/rate-limit.ts`). Com PM2 em cluster ou várias instâncias, o limite
passa a valer por processo, e o bloqueio de força-bruta fica mais frouxo na
proporção do número de instâncias. Para escalar horizontalmente, esse
contador precisa ir para o banco ou um Redis.

**Sessão sem revogação individual.** O cookie é autocontido e válido até
expirar (8h) ou até o timeout de inatividade. Não há como derrubar a sessão
de UM usuário específico; trocar o `AUTH_SECRET` derruba todas.

**Isolamento por clínica é da aplicação, não do banco.** No Postgres isso era
garantido por RLS. Em MySQL não existe RLS, então o filtro por `clinic_id` é
injetado pela camada de dados (`src/lib/db/query-builder.ts`). Consequência
prática: qualquer código novo que fale com o MySQL **fora** dessa camada
ignora o isolamento. Use sempre `createClient()`; o `createServiceClient()`
não aplica escopo e existe só para rotina administrativa.

**Índices únicos parciais.** MySQL não os suporta; viraram índices comuns.
CPF/CNS duplicado na mesma clínica é barrado pela aplicação, não pelo banco
(detalhe no fim de `mysql/agicare_mysql.sql`).

**Funções e triggers do Postgres não foram convertidas.** Uma delas era regra
de negócio real: o bloqueio de saída de estoque acima do saldo
(`0045_estoque_rejeita_oversell`). Hoje essa checagem não existe no banco.

## O que NÃO foi verificado

Sendo direto sobre o limite do que testei:

- **`npm run build` nunca rodou até o fim.** O ambiente onde trabalhei não
  consegue manter um processo longo. Verifiquei a tipagem com `tsc` nos dois
  subconjuntos do projeto (0 erros), mas o build também faz bundling e lint,
  e pode falhar por algo que o `tsc` não pega. **Rode o build antes de
  planejar o deploy.**
- **Nunca rodou com `NODE_ENV=production`.** Toda a validação foi em
  `npm run dev`. Em produção o cookie passa a exigir HTTPS e o
  `AUTH_SECRET` passa a ser obrigatório — dois comportamentos que só
  aparecem nesse modo.
- **Nunca conectou em banco remoto.** As opções de TLS (`MYSQL_SSL`) e
  timeout foram escritas mas testadas apenas contra MySQL local.
- **A maioria das telas foi vista com tabelas vazias.** Login, catálogo CID
  (15 mil registros), permissões, configurações e o cadastro/ficha de
  paciente rodaram com dados reais. Os outros módulos abriram sem erro, mas
  com zero linhas — as consultas com JOIN aninhado ainda não foram exercidas
  com dados de verdade. O caminho mais valioso a testar antes de produção é
  um fluxo completo: profissional → agendamento → check-in → atendimento →
  procedimento → check-out.
