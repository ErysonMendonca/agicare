# agicare — banco em MySQL

`agicare_mysql.sql` é a estrutura do banco do Supabase (Postgres) convertida para
MySQL 8, com os dados básicos já semeados.

## Importar

```bash
mysql -u root --default-character-set=utf8mb4 < agicare_mysql.sql
```

Cria o banco `agicare` (utf8mb4 / InnoDB) e popula tudo.

Testado em **MariaDB 10.4** (XAMPP) e compatível com **MySQL 8.0.16+** — precisa
dessas versões por causa de `DEFAULT` de expressão, `CHECK` e colunas geradas.

> **O script espera um banco `agicare` limpo.** Ele não é idempotente: rodar duas
> vezes falha com chave/índice duplicado. Se uma importação falhar no meio, apague
> antes de repetir:
>
> ```bash
> mysql -u root -e "DROP DATABASE IF EXISTS agicare;"
> ```

No XAMPP o binário fica em `C:\xampp\mysql\bin\mysql.exe` e o root normalmente não
tem senha (use sem `-p`).

## Conferir a importação

```bash
mysql -u root agicare --force --default-character-set=utf8mb4 < verificar.sql
```

Compara "esperado" com "encontrado" para estrutura e dados, e roda 4 testes que
gravam dado inválido de propósito para provar que as constraints estão valendo
(CHECK, ENUM, índice único sobre coluna gerada, normalização de CPF).

O `--force` é obrigatório: sem ele o cliente aborta no primeiro erro provocado e
os testes seguintes não rodam.

## O que vem dentro

| | |
|---|---|
| Tabelas | 83 do schema `public` + `auth_users` |
| Enums | 25 (ENUM nativo do MySQL) |
| Chaves estrangeiras | 247 |
| Índices | 185 |
| CIDs | 15.104 |
| Opções de atendimento | 139 |
| Permissões | 72 templates + 72 papéis |
| Configuração do sistema | `clinics` + `clinic_settings` |
| Conta admin | `admin@agicare.local` / `Agicare@2026` |

⚠ **Troque a senha do admin no primeiro acesso** — ela está em texto claro no `.sql`.

## Pontos de atenção

O arquivo `.sql` termina com um bloco de comentários detalhando tudo isso. Em resumo:

1. **RLS não existe em MySQL.** As 103 policies que garantiam isolamento por
   clínica e proteção do prontuário (LGPD) *não* foram convertidas — não há como.
   Essa autorização precisa ser feita na aplicação.
2. **Funções e triggers** (26 + 19) não foram convertidas. Algumas eram regra de
   negócio real, como o bloqueio de venda de estoque acima do saldo.
3. **Índices parciais** (`UNIQUE ... WHERE`) viraram índices comuns — perderam a
   unicidade condicional (ex.: CPF único por clínica). Validar na aplicação.
4. **`timestamptz` → `DATETIME(6)`**, que não guarda timezone. Gravar em UTC.
5. **Storage**: os arquivos (prontuário digitalizado, logo, anexos) ficavam no
   Supabase Storage. As colunas de caminho continuam, os arquivos não.
6. **A aplicação não roda sobre este banco como está.** O código em
   `src/lib/supabase/` fala com o Supabase via PostgREST. Este arquivo entrega o
   *banco* convertido; trocar a camada de dados e a autenticação é outro trabalho.

## Regerar o .sql

Os scripts aqui reconstroem o arquivo a partir de `supabase/migrations/` — útil
quando novas migrations entrarem.

```bash
npm install @electric-sql/pglite bcryptjs node-sql-parser

node replay.mjs        # aplica as migrations num Postgres real (WASM) e introspecta
node to-mysql.mjs      # traduz o schema para MySQL
node dump-seeds.mjs    # extrai os dados semeados pelas migrations
node montar.mjs        # junta schema + admin + seeds + notas
node validar.mjs       # valida a sintaxe MySQL de cada statement
node lint-mysql.mjs    # checa FK/índices/limites do InnoDB
```

Os dois últimos devem terminar com **0 erros**.

> Os scripts usam caminhos absolutos de `/tmp/pgtest` e das migrations — ajuste as
> constantes do topo de cada arquivo se rodar em outro lugar.
